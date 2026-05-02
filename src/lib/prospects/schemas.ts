import { z } from "zod";

export const prospectCompanyConfidenceSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
]);

export const scoreYoutubeProspectsPayloadSchema = z.object({
  review_id: z.string().uuid(),
});

export const prospectIcpAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["promising", "unclear", "poor_fit"]),
  reason: z.string(),
  fitSignals: z.array(z.string()),
  objectionsOrNeeds: z.array(z.string()),
  company: z.object({
    name: z.string().nullable(),
    domain: z.string().nullable(),
    confidence: prospectCompanyConfidenceSchema,
    evidence: z.string(),
  }),
});

export type ScoreYoutubeProspectsPayload = z.infer<
  typeof scoreYoutubeProspectsPayloadSchema
>;
export type ProspectIcpAnalysis = z.infer<typeof prospectIcpAnalysisSchema>;
