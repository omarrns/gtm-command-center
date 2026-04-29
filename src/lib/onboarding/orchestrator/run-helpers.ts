import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { shouldSkipDimension } from "@/lib/onboarding/icp-dimensions";
import type {
  Dimension,
  InterviewTemplate,
} from "@/lib/onboarding/templates/types";
import type { OnboardingArtifactRow } from "@/lib/supabase/types";
import type { OrchestratorState } from "./types";

const subDimensionEvidenceSchema = z.object({
  strength: z.enum([
    "direct_user_provided",
    "inferred_from_customer_examples",
    "inferred_from_public_data",
    "weak_or_unknown",
  ]),
  proofPoints: z.array(z.string()).default([]),
  sources: z
    .array(
      z.object({
        type: z.enum(["artifact", "url", "user_answer", "public_research"]),
        label: z.string(),
        quote: z.string().optional(),
      }),
    )
    .default([]),
  notes: z.string().default(""),
});

type AgenticTemplate = Extract<InterviewTemplate, { agenticMode: true }>;

const MAX_ASKS_PER_DIMENSION = 2;

export function computeNextKey(
  state: OrchestratorState,
  template: AgenticTemplate,
): string | null {
  for (const dim of template.dimensions) {
    const askCount = state.askedDimensionKeys.filter(
      (key) => key === dim.key,
    ).length;
    if (askCount >= MAX_ASKS_PER_DIMENSION) continue;

    const cur = state.dimensions[dim.key];
    if (!cur) return dim.key;
    if (template.id !== "icp_definition") {
      if (cur.confidence < dim.confidenceThreshold) return dim.key;
      continue;
    }
    if (
      !shouldSkipDimension(dim.key, {
        value: cur.value,
        threshold: dim.confidenceThreshold,
        evidenceCoverage: cur.evidenceCoverage,
        missingFields: cur.missingFields,
        weakFields: cur.weakFields,
        confirmedWeakFields: cur.confirmedWeakFields,
      })
    ) {
      return dim.key;
    }
  }
  return null;
}

export const dimensionAnalysisSchema = z.object({
  value: z.unknown(),
  summary: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.record(z.string(), subDimensionEvidenceSchema).optional(),
  provenance: z
    .array(
      z.object({
        artifactId: z.string().optional(),
        sourceLabel: z.string(),
        quote: z.string().optional(),
      }),
    )
    .default([]),
});

export function buildAnalysisResultSchema(dimensions: readonly Dimension[]) {
  const shape: Record<
    string,
    z.ZodOptional<typeof dimensionAnalysisSchema>
  > = {};
  for (const dim of dimensions) {
    shape[dim.key] = dimensionAnalysisSchema.optional();
  }
  return z.object({
    dimensions: z.object(shape),
  });
}

export const singleDimensionResultSchema = z.object({
  value: z.unknown(),
  summary: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.record(z.string(), subDimensionEvidenceSchema).optional(),
});

export async function loadArtifactsForInterview(
  svc: SupabaseClient,
  interviewId: string,
): Promise<OnboardingArtifactRow[]> {
  const { data, error } = await svc
    .from("onboarding_artifacts")
    .select("*")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load artifacts: ${error.message}`);
  return (data ?? []) as OnboardingArtifactRow[];
}

export function buildArtifactsBlock(artifacts: OnboardingArtifactRow[]): string {
  if (artifacts.length === 0) return "(no artifacts provided)";
  return artifacts
    .map((a, i) => {
      const label =
        a.source_label ??
        a.source_url ??
        a.file_name ??
        `${a.kind} artifact #${i + 1}`;
      return `<artifact id="${a.id}" kind="${a.kind}" source="${label}">\n${a.normalized_markdown ?? ""}\n</artifact>`;
    })
    .join("\n\n");
}

export function buildDimensionsBlock(dimensions: readonly Dimension[]): string {
  return dimensions
    .map(
      (d) =>
        `- **${d.key}** (threshold ${d.confidenceThreshold.toFixed(2)}): ${d.description}`,
    )
    .join("\n");
}

export function dimensionStatusFromConfidence(
  confidence: number,
  threshold: number,
  answered: boolean,
) {
  if (answered) return "answered" as const;
  if (confidence >= threshold) return "inferred" as const;
  return "needs_question" as const;
}
