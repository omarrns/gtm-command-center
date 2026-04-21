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
import { getTemplate } from "@/lib/onboarding/templates";

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
    .select("id, user_id, is_refresh, status, template_id")
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== user.id) {
    return new Response("Interview not found", { status: 404 });
  }

  if (interview.status !== "in_progress") {
    return new Response("Interview is not in progress", { status: 400 });
  }

  const template = getTemplate(interview.template_id);
  const MAX_ASSISTANT_MESSAGES = template.maxAssistantMessages;
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

  let systemPrompt = template.systemPrompt({
    isRefresh: interview.is_refresh,
    existingProfile,
  });

  if (assistantCount >= template.wrapUpThreshold) {
    systemPrompt += `\n\n## URGENT: WRAP UP NOW\n\nThis is assistant message ${assistantCount + 1} of ${MAX_ASSISTANT_MESSAGES}. You MUST wrap up this conversation now. Summarize what you've heard, end with ${template.completionMarker} on its own line. Do NOT ask more questions.`;
  }

  const result = streamText({
    model: anthropic(template.chatModel),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: template.tools,
    maxOutputTokens: template.chatMaxOutputTokens,
  });

  const response = result.toUIMessageStreamResponse({
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

        if (lastText.includes(template.completionMarker)) {
          isComplete = true;
        }

        // Fallback: if the threshold topics are covered and the last message
        // looks like a wrap-up (no question mark = not asking another
        // question), treat it as complete. Catches cases where the model
        // wraps up conversationally without the exact marker.
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
