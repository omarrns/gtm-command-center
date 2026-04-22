import type { UIMessage } from "ai";
import type { InterviewTemplate } from "./templates/types";
import { formatTranscript } from "./transcript";
import { runGenerateObject, type AiCallScope } from "@/lib/ai/calls";

/**
 * Run Opus over a transcript + return a shape matching the template's
 * extractionSchema. Generic on the extraction output type `X` — each
 * template owns its own schema + inferred type. The first generic slot is
 * the edits shape, which extraction doesn't care about.
 *
 * `scope` is optional and used purely for ai_calls capture so the call
 * can be replayed by interview ID later.
 */
export async function runExtractionFromTranscript<X>(
  messages: UIMessage[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: InterviewTemplate<any, X>,
  scope?: AiCallScope,
): Promise<X> {
  const transcript = formatTranscript(messages);

  const object = await runGenerateObject({
    model: template.extractionModel,
    system: template.extractionSystemPrompt,
    prompt: `<transcript>\n${transcript}\n</transcript>\n\nExtract the structured data from this interview transcript.`,
    schema: template.extractionSchema,
    maxOutputTokens: template.extractionMaxOutputTokens,
    scope: scope
      ? { ...scope, callPurpose: scope.callPurpose ?? "extract" }
      : undefined,
  });

  return object as X;
}
