import { z } from "zod";
import { runGenerateObject, type AiCallScope } from "@/lib/ai/calls";
import { MODELS } from "@/lib/ai/anthropic";
import {
  buildReplyClassificationPrompt,
  buildReplyClassificationSystem,
} from "@/lib/skills/prompts/reply-classification";

export const replyClassificationSchema = z
  .object({
    classification: z.enum([
      "positive_interest",
      "objection",
      "referral",
      "unsubscribe",
      "out_of_office",
      "neutral_or_unclear",
    ]),
    objection_theme: z
      .enum([
        "pricing_or_budget",
        "timing",
        "priority",
        "authority",
        "fit",
        "existing_solution",
        "needs_more_info",
        "not_interested",
        "other",
      ])
      .nullable(),
  })
  .strict();

export type ReplyClassification = z.infer<typeof replyClassificationSchema>;

export async function classifyReplyBody({
  replyBody,
  scope,
}: {
  replyBody: string;
  scope: AiCallScope;
}): Promise<ReplyClassification> {
  const args = {
    system: buildReplyClassificationSystem(),
    prompt: buildReplyClassificationPrompt(replyBody),
    schema: replyClassificationSchema,
    maxOutputTokens: 300,
    scope,
    structuredOutputMode: "outputFormat" as const,
  };

  try {
    return await runGenerateObject({
      ...args,
      model: MODELS.tinyExtraction,
    });
  } catch {
    return runGenerateObject({
      ...args,
      model: MODELS.haiku,
    });
  }
}
