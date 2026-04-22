import type { UIMessage } from "ai";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { InterviewTemplate } from "./templates/types";
import { formatTranscript } from "./transcript";

/**
 * Run Opus over a transcript + return a shape matching the template's
 * extractionSchema. Generic on the extraction output type `X` — each
 * template owns its own schema + inferred type. The first generic slot is
 * the edits shape, which extraction doesn't care about.
 */
export async function runExtractionFromTranscript<X>(
  messages: UIMessage[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: InterviewTemplate<any, X>,
): Promise<X> {
  const transcript = formatTranscript(messages);

  const { object } = await generateObject({
    model: anthropic(template.extractionModel),
    system: template.extractionSystemPrompt,
    prompt: `<transcript>\n${transcript}\n</transcript>\n\nExtract the structured data from this interview transcript.`,
    schema: template.extractionSchema,
    maxOutputTokens: template.extractionMaxOutputTokens,
  });

  return object as X;
}
