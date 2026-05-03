import { gateway, streamObject, type UIMessage } from "ai";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { aiUsageTokens, captureAiCall } from "@/lib/ai/calls";
import { getTemplate } from "@/lib/onboarding/templates";
import { formatTranscript } from "@/lib/onboarding/transcript";
import { parseStoryStreamRequest } from "../../_lib/request-validation";

export const maxDuration = 300;

export async function POST(req: Request) {
  const parsed = await parseStoryStreamRequest(req);
  if (!parsed.ok) return parsed.response;
  const { interviewId } = parsed.data;
  const user = await requireUser();

  const svc = createSupabaseServiceClient();

  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("id, user_id, status, template_id, messages, extracted")
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
  const existingInsights = (
    interview.extracted as Record<string, unknown> | null
  )?.insights;
  if (existingInsights) {
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
  const extractedContext = JSON.stringify(interview.extracted ?? {}, null, 2);
  const prompt = `<transcript>\n${transcript}\n</transcript>\n\n<reviewed_context>\n${extractedContext}\n</reviewed_context>\n\nWrite the reflective synthesis now. Return JSON matching the schema in your system prompt.`;
  const model = template.insightsModel ?? template.extractionModel;
  const providerOptions = model.startsWith("anthropic/")
    ? { anthropic: { structuredOutputMode: "jsonTool" as const } }
    : undefined;
  const startedAt = Date.now();

  const result = streamObject({
    model: gateway(model),
    system: template.insightsSystemPrompt,
    prompt,
    schema: template.insightsSchema,
    maxOutputTokens: template.extractionMaxOutputTokens,
    // Opt out of Anthropic's native structured-output path for parity
    // with runGenerateObject (src/lib/ai/calls.ts). See comment there
    // for the rationale.
    providerOptions,
    onFinish: async ({ object, usage, error }) => {
      await captureAiCall(
        {
          userId: user.id,
          scopeTable: "onboarding_interviews",
          scopeId: interviewId,
          callPurpose: "onboarding_story",
        },
        {
          model,
          callKind: "object",
          systemPrompt: template.insightsSystemPrompt,
          userPrompt: prompt,
          responseObject: object,
          ...aiUsageTokens(usage),
          latencyMs: Date.now() - startedAt,
          error: error
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined,
        },
      );
      if (!object) return;

      const updatedExtracted = {
        ...((interview.extracted as Record<string, unknown>) ?? {}),
        insights: object,
      };

      const { error: updateErr } = await svc
        .from("onboarding_interviews")
        .update({
          extracted: updatedExtracted,
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
