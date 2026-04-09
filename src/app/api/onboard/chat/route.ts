import {
  streamText,
  convertToModelMessages,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import {
  buildInterviewPrompt,
  interviewTools,
  type InterviewTopic,
} from "@/lib/onboarding/interview-prompt";

export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await requireUser();
  const { messages, interviewId } = (await req.json()) as {
    messages: UIMessage[];
    interviewId: string;
  };

  const svc = createSupabaseServiceClient();

  // Load interview row — verify ownership and status
  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("id, user_id, is_refresh, status")
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== user.id) {
    return new Response("Interview not found", { status: 404 });
  }

  if (interview.status !== "in_progress") {
    return new Response("Interview is not in progress", { status: 400 });
  }

  // Hard cap: count existing assistant messages. If at limit, force completion.
  const MAX_ASSISTANT_MESSAGES = 12;
  const assistantCount = messages.filter((m) => m.role === "assistant").length;

  if (assistantCount >= MAX_ASSISTANT_MESSAGES) {
    // Already at cap — force extraction without generating more
    await svc
      .from("onboarding_interviews")
      .update({
        messages,
        ready_for_extraction: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", interviewId);

    return new Response("Interview cap reached", { status: 200 });
  }

  // For refresh mode, load existing profile for system prompt context
  let existingProfile: string | undefined;
  if (interview.is_refresh) {
    const ctx = await loadMemoryContext(user.id, svc);
    existingProfile = formatMemoryForPrompt(ctx);
  }

  let systemPrompt = buildInterviewPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
  });

  // Inject wrap-up instruction when approaching the cap
  if (assistantCount >= 10) {
    systemPrompt += `\n\n## URGENT: WRAP UP NOW\n\nThis is assistant message ${assistantCount + 1} of ${MAX_ASSISTANT_MESSAGES}. You MUST wrap up this conversation now. Summarize what you've heard, end with [INTERVIEW_COMPLETE] on its own line. Do NOT ask more questions.`;
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: interviewTools,
    maxOutputTokens: 1024,
  });

  const response = result.toUIMessageStreamResponse({
    sendReasoning: false,
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      // Extract topics from report_topics tool parts in all messages (v6 pattern)
      const topicSet = new Set<InterviewTopic>();
      for (const msg of finalMessages) {
        if (msg.role !== "assistant") continue;
        for (const part of msg.parts) {
          if (
            isToolUIPart(part) &&
            getToolName(part) === "report_topics" &&
            "input" in part &&
            part.input
          ) {
            const input = part.input as { covered: InterviewTopic[] };
            for (const topic of input.covered) {
              topicSet.add(topic);
            }
          }
        }
      }

      // Check for completion in the last assistant message
      const lastAssistant = [...finalMessages]
        .reverse()
        .find((m) => m.role === "assistant");

      let isComplete = false;

      if (lastAssistant) {
        const lastText = lastAssistant.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");

        // Primary: explicit marker
        if (lastText.includes("[INTERVIEW_COMPLETE]")) {
          isComplete = true;
        }

        // Fallback: if 5+ topics covered and the last message looks like
        // a wrap-up (no question mark = not asking another question),
        // treat it as complete. This catches cases where the model wraps
        // up conversationally without the exact marker.
        if (!isComplete && topicSet.size >= 5 && !lastText.includes("?")) {
          console.log(
            "[onboard/chat] wrap-up heuristic triggered: topics=" +
              topicSet.size +
              ", no question in last message",
          );
          isComplete = true;
        }
      }

      // Persist messages and update state
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
        .eq("id", interviewId);
    },
  });

  return response;
}
