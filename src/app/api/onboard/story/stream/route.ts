import { streamObject, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getTemplate } from "@/lib/onboarding/templates";
import { formatTranscript } from "@/lib/onboarding/transcript";

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await requireUser();
  const { interviewId } = (await req.json()) as { interviewId: string };

  if (!interviewId) {
    return new Response("interviewId required", { status: 400 });
  }

  const svc = createSupabaseServiceClient();

  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select(
      "id, user_id, status, template_id, messages, extracted, extracted_insights",
    )
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== user.id) {
    return new Response("Interview not found", { status: 404 });
  }

  if (interview.status !== "story_review") {
    return new Response(
      `Interview not in story_review (status: ${interview.status})`,
      { status: 400 },
    );
  }

  // Idempotency: if insights are already populated, the user should land
  // straight in the reading view instead of re-paying for an Opus call.
  if (interview.extracted_insights) {
    return new Response("Insights already generated", { status: 409 });
  }

  const template = getTemplate(interview.template_id);
  if (!template.agenticMode) {
    return new Response("Story phase requires agentic template", {
      status: 400,
    });
  }
  if (!template.insightsSchema || !template.insightsSystemPrompt) {
    return new Response("Template does not define insights synthesis", {
      status: 400,
    });
  }

  const transcript = formatTranscript(
    (interview.messages ?? []) as UIMessage[],
  );

  const result = streamObject({
    model: anthropic(template.extractionModel),
    system: template.insightsSystemPrompt,
    prompt: `<transcript>\n${transcript}\n</transcript>\n\nWrite the reflective synthesis now. Return JSON matching the schema in your system prompt.`,
    schema: template.insightsSchema,
    maxOutputTokens: template.extractionMaxOutputTokens,
    onFinish: async ({ object }) => {
      if (!object) return;

      // Dual-write: unified `extracted.insights` (the column performConfirm
      // reads first) + legacy `extracted_insights`. Mirrors the dual-write
      // pattern used by extractAndReviewAction and the chat route.
      const updatedExtracted = {
        ...((interview.extracted as Record<string, unknown>) ?? {}),
        insights: object,
      };

      const { error: updateErr } = await svc
        .from("onboarding_interviews")
        .update({
          extracted: updatedExtracted,
          extracted_insights: object as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq("id", interviewId);

      if (updateErr) {
        console.error(
          "[story/stream] persist insights failed:",
          updateErr.message,
        );
      }
    },
  });

  return result.toTextStreamResponse();
}
