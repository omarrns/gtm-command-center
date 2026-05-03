import { z } from "zod";

export const icpChatSessionCreateSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  accountName: z.string().trim().min(1).max(160).optional(),
  accountDomain: z.string().trim().min(1).max(160).optional(),
  purpose: z.string().trim().min(1).max(120).default("account_prep"),
});

export const icpChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  messages: z.array(z.unknown()).min(1),
});

export const sessionInsightSchema = z.object({
  summary: z.string().min(1),
  account: z
    .object({
      name: z.string().optional(),
      domain: z.string().optional(),
    })
    .optional(),
  keySignals: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  buyerLanguage: z.array(z.string()).default([]),
  icpContradictions: z.array(z.string()).default([]),
  suggestedUpdates: z
    .array(
      z.object({
        target: z.enum(["rubric", "narrative", "none"]),
        path: z.string(),
        currentValue: z.string().optional(),
        suggestedValue: z.string(),
        reason: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  explicitUpdateRequest: z.boolean().default(false),
});

export const routedEvidenceSchema = z.object({
  items: z.array(
    z.object({
      evidenceType: z.enum([
        "account_memory",
        "messaging_lesson",
        "icp_calibration",
        "ignored",
      ]),
      title: z.string().min(1),
      detail: z.string().min(1),
      target: z.string().default("none"),
      confidence: z.number().min(0).max(1),
      shouldEvaluateRevision: z.boolean().default(false),
    }),
  ),
});

export const revisionPatchSchema = z.object({
  op: z.enum(["append", "remove"]),
  path: z.string().min(1),
  value: z.string().min(1),
});

export const revisionProposalSchema = z.object({
  shouldPropose: z.boolean(),
  target: z.enum(["rubric", "narrative"]),
  title: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  patches: z.array(revisionPatchSchema).max(5),
});

export const revisionJudgeSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  risks: z.array(z.string()).default([]),
});

export type IcpChatSessionCreate = z.infer<
  typeof icpChatSessionCreateSchema
>;
export type SessionInsight = z.infer<typeof sessionInsightSchema>;
export type RoutedEvidence = z.infer<typeof routedEvidenceSchema>;
export type RevisionPatch = z.infer<typeof revisionPatchSchema>;
export type RevisionProposal = z.infer<typeof revisionProposalSchema>;
export type RevisionJudge = z.infer<typeof revisionJudgeSchema>;
