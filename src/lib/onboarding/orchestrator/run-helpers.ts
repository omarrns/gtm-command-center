import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Dimension } from "@/lib/onboarding/templates/types";
import type { OnboardingArtifactRow } from "@/lib/supabase/types";

export const dimensionAnalysisSchema = z.object({
  value: z.unknown(),
  summary: z.string(),
  // TODO(phase-3): make legacy model-reported confidence optional.
  confidence: z.number().min(0).max(1),
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
  // TODO(phase-3): make legacy model-reported confidence optional.
  confidence: z.number().min(0).max(1),
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
