import {
  gateway,
  streamText,
  convertToModelMessages,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from "ai";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplate } from "@/lib/onboarding/templates/types";
import {
  loadPositiveExemplarCount,
  nextDimensionToAsk,
  updateDimensionFromAnswer,
} from "@/lib/onboarding/orchestrator/run";
import {
  emptyOrchestratorState,
  type OrchestratorState,
} from "@/lib/onboarding/orchestrator/types";
import { toConfirmEditsForTemplate } from "@/lib/onboarding/orchestrator/to-confirm-edits";

export const maxDuration = 120;

type AgenticTemplate = Extract<InterviewTemplate, { agenticMode: true }>;
type LegacyTemplate = Extract<InterviewTemplate, { agenticMode: false }>;

type Svc = ReturnType<typeof createSupabaseServiceClient>;

interface InterviewRow {
  id: string;
  user_id: string;
  is_refresh: boolean;
  status: string;
  template_id: string;
  orchestrator_state: Record<string, unknown> | null;
}

export async function POST(req: Request) {
  const user = await requireUser();
  const { messages, interviewId } = (await req.json()) as {
    messages: UIMessage[];
    interviewId: string;
  };

  const svc = createSupabaseServiceClient();

  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("id, user_id, is_refresh, status, template_id, orchestrator_state")
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== user.id) {
    return new Response("Interview not found", { status: 404 });
  }

  if (interview.status !== "in_progress") {
    return new Response("Interview is not in progress", { status: 400 });
  }

  const template = getTemplate(interview.template_id);

  if (template.agenticMode) {
    return handleAgenticTurn(
      messages,
      interview as InterviewRow,
      template,
      svc,
      user.id,
    );
  }

  return handleLegacyTurn(messages, interview as InterviewRow, template, svc);
}

async function handleAgenticTurn(
  messages: UIMessage[],
  interview: InterviewRow,
  template: AgenticTemplate,
  svc: Svc,
  userId: string,
): Promise<Response> {
  let state =
    (interview.orchestrator_state as OrchestratorState | null) ??
    emptyOrchestratorState(template.id);

  // Step 1: if a dimension was being asked, attribute the latest user message
  // to it and let the orchestrator update confidence + provenance.
  if (state.activeDimensionKey) {
    const latest = latestUserMessageText(messages);
    if (latest) {
      state = await updateDimensionFromAnswer(
        interview.id,
        state.activeDimensionKey,
        latest.text,
        latest.id,
        svc,
        template,
      );
    }
  }

  // Refresh-mode context (loaded per request)
  let existingProfile: string | undefined;
  if (interview.is_refresh) {
    const ctx = await loadMemoryContext(userId, svc);
    existingProfile = formatMemoryForPrompt(ctx);
  }

  // Step 2: compute next dimension to ask (or null = done)
  const next = nextDimensionToAsk(state, template);

  if (next === null) {
    // Interview is done — set the interview to review status and return a
    // short wrap-up stream. No dimension to ask; the review UI takes over.
    const finalState: OrchestratorState = {
      ...state,
      status: "ready_for_review",
      activeDimensionKey: null,
      nextDimensionKey: null,
    };

    // Hydrate the unified `extracted` slot from orchestrator so the review
    // UI initializes from the orchestrator's inferred values, not empty
    // defaults. Without this the user's review submit would overwrite
    // orchestrator output.
    const { edits: initialReviewEdits } = toConfirmEditsForTemplate(
      finalState,
      template,
    );

    const wrapUpSystem = `You are wrapping up an interview. Briefly thank the user and tell them the review screen is next. Keep it to 1–2 sentences. End with ${template.completionMarker} on its own line. Do NOT ask questions.`;

    const result = streamText({
      model: gateway(template.chatModel),
      system: wrapUpSystem,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: 256,
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: false,
      originalMessages: messages,
      onFinish: async ({ messages: finalMessages }) => {
        await svc
          .from("onboarding_interviews")
          .update({
            messages: finalMessages,
            orchestrator_state: finalState,
            status: "review",
            extracted: initialReviewEdits,
            updated_at: new Date().toISOString(),
          })
          .eq("id", interview.id);
      },
    });
  }

  // Step 3: ask the next low-confidence dimension.
  const dim = state.dimensions[next.key];
  const hypothesis =
    dim?.summary ??
    "(no prior inference — artifacts yielded nothing for this dimension)";

  // ICP exemplar-scarcity guidance needs the positive count. Skipped for
  // job_search to avoid an unnecessary DB hit per turn.
  const positiveExemplarCount =
    template.id === "icp_definition"
      ? await loadPositiveExemplarCount(svc, interview.id)
      : undefined;

  const interviewerSystem = template.interviewerSystemPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
    nextDimension: next,
    currentHypothesis: hypothesis,
    positiveExemplarCount,
    hypothesisValue: dim?.value,
    hypothesisConfidence: dim?.confidence,
  });

  // Always push — askedDimensionKeys is a log of ask events, not a set.
  // Count per key gates the bounded re-ask behavior in computeNextKey.
  const pendingState: OrchestratorState = {
    ...state,
    status: "interviewing",
    activeDimensionKey: next.key,
    nextDimensionKey: next.key,
    askedDimensionKeys: [...state.askedDimensionKeys, next.key],
    metrics: {
      ...state.metrics,
      questionCount: state.metrics.questionCount + 1,
    },
  };

  // Persist BEFORE streaming so a crash mid-stream still leaves us able to
  // pick up the conversation on reload.
  await svc
    .from("onboarding_interviews")
    .update({
      orchestrator_state: pendingState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interview.id);

  const result = streamText({
    model: gateway(template.chatModel),
    system: interviewerSystem,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: template.chatMaxOutputTokens,
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      await svc
        .from("onboarding_interviews")
        .update({
          messages: finalMessages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", interview.id);
    },
  });
}

async function handleLegacyTurn(
  messages: UIMessage[],
  interview: InterviewRow,
  template: LegacyTemplate,
  svc: Svc,
): Promise<Response> {
  const MAX_ASSISTANT_MESSAGES = template.maxAssistantMessages;
  const assistantCount = messages.filter((m) => m.role === "assistant").length;

  if (assistantCount >= MAX_ASSISTANT_MESSAGES) {
    await svc
      .from("onboarding_interviews")
      .update({
        messages,
        ready_for_extraction: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", interview.id);

    return new Response("Interview cap reached", { status: 200 });
  }

  let existingProfile: string | undefined;
  if (interview.is_refresh) {
    const ctx = await loadMemoryContext(interview.user_id, svc);
    existingProfile = formatMemoryForPrompt(ctx);
  }

  let systemPrompt = template.systemPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
  });

  if (assistantCount >= template.wrapUpThreshold) {
    systemPrompt += `\n\n## URGENT: WRAP UP NOW\n\nThis is assistant message ${assistantCount + 1} of ${MAX_ASSISTANT_MESSAGES}. You MUST wrap up this conversation now. Summarize what you've heard, end with ${template.completionMarker} on its own line. Do NOT ask more questions.`;
  }

  const result = streamText({
    model: gateway(template.chatModel),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: template.tools,
    maxOutputTokens: template.chatMaxOutputTokens,
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      // Extract topics from report_topics tool parts in all messages (v6 pattern).
      // The tool name is fixed by contract across templates.
      const topicSet = new Set<string>();
      for (const msg of finalMessages) {
        if (msg.role !== "assistant") continue;
        for (const part of msg.parts) {
          if (
            isToolUIPart(part) &&
            getToolName(part) === "report_topics" &&
            "input" in part &&
            part.input
          ) {
            const input = part.input as { covered: string[] };
            for (const topic of input.covered) {
              topicSet.add(topic);
            }
          }
        }
      }

      const lastAssistant = [...finalMessages]
        .reverse()
        .find((m) => m.role === "assistant");

      let isComplete = false;

      if (lastAssistant) {
        const lastText = lastAssistant.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");

        if (lastText.includes(template.completionMarker)) {
          isComplete = true;
        }

        // Fallback: if the threshold topics are covered and the last message
        // looks like a wrap-up (no question mark), treat it as complete.
        if (
          !isComplete &&
          topicSet.size >= template.completionTopicThreshold &&
          !lastText.includes("?")
        ) {
          console.log(
            "[onboard/chat] wrap-up heuristic triggered: topics=" +
              topicSet.size +
              ", no question in last message",
          );
          isComplete = true;
        }
      }

      const updateData: Record<string, unknown> = {
        messages: finalMessages,
        topics_covered: [...topicSet],
        updated_at: new Date().toISOString(),
      };

      if (isComplete) {
        updateData.ready_for_extraction = true;
      }

      await svc
        .from("onboarding_interviews")
        .update(updateData)
        .eq("id", interview.id);
    },
  });
}

function latestUserMessageText(
  messages: UIMessage[],
): { id: string; text: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (!text.trim()) return null;
    return { id: m.id, text };
  }
  return null;
}
