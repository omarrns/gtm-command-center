import type { UIMessage } from "ai";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt";
import type { InterviewTemplate } from "./templates/types";

const profileSchema = z.object({
  positioning: z.string().default(""),
  careerHighlights: z.string().default(""),
  proofPoints: z.string().default(""),
  technicalTools: z.string().default(""),
});

const searchSchema = z.object({
  searchQueries: z.array(z.string()).default(["Software Engineer"]),
  searchLocations: z.array(z.string()).default(["Remote"]),
  scoreThreshold: z.number().default(70),
  dailySendCap: z.number().default(10),
});

const outreachSchema = z.object({
  greenFlags: z.string().default(""),
  redFlags: z.string().default(""),
  outreachTone: z.enum(["casual", "direct", "formal"]).default("casual"),
  whatsWorked: z.string().default(""),
  whatToAvoid: z.string().default(""),
});

const insightsSchema = z.object({
  career_narrative: z.string().default(""),
  decision_drivers: z.array(z.string()).default([]),
  unstated_preferences: z.array(z.string()).default([]),
  strongest_stories: z.array(z.string()).default([]),
  positioning_alternatives: z.array(z.string()).default([]),
  risk_tolerance: z.string().default(""),
  communication_style_notes: z.string().default(""),
});

export const extractionResultSchema = z.object({
  profile: profileSchema,
  search: searchSchema,
  outreach: outreachSchema,
  insights: insightsSchema,
});

export type ExtractionProfile = z.infer<typeof profileSchema>;
export type ExtractionSearch = z.infer<typeof searchSchema>;
export type ExtractionOutreach = z.infer<typeof outreachSchema>;
export type ExtractionInsights = z.infer<typeof insightsSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

function formatTranscript(messages: UIMessage[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "Coach" : "User";
    for (const part of msg.parts) {
      if (part.type === "text" && part.text.trim()) {
        lines.push(`${role}: ${part.text.trim()}`);
      }
    }
  }

  return lines.join("\n\n");
}

export async function runExtractionFromTranscript(
  messages: UIMessage[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: InterviewTemplate<any, any>,
): Promise<ExtractionResult> {
  const transcript = formatTranscript(messages);

  const { object } = await generateObject({
    model: anthropic(template.extractionModel),
    system: template.extractionSystemPrompt,
    prompt: `<transcript>\n${transcript}\n</transcript>\n\nExtract the structured data from this interview transcript.`,
    schema: template.extractionSchema,
    maxOutputTokens: template.extractionMaxOutputTokens,
  });

  return object as ExtractionResult;
}
