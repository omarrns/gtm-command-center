import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dimension } from "@/lib/onboarding/templates/types";
import type { OnboardingArtifactRow } from "@/lib/supabase/types";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";
import {
  ICP_DIMENSIONS,
  calculateDimensionQuality,
  type SubDimensionEvidence,
} from "@/lib/onboarding/icp-dimensions";
import { computeIcpDimensionMetadata } from "@/lib/onboarding/orchestrator/icp-metadata";

const ICP_EXEMPLAR_DERIVED_DIMENSIONS = [
  "firmographics",
  "technographics",
  "signals",
] as const;

export function countPositiveExemplars(
  artifacts: ReadonlyArray<OnboardingArtifactRow>,
): number {
  return artifacts.filter(
    (a) => a.kind === "positive_example" && a.status === "succeeded",
  ).length;
}

export async function loadPositiveExemplarCount(
  svc: SupabaseClient,
  interviewId: string,
): Promise<number> {
  const { count } = await svc
    .from("onboarding_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("interview_id", interviewId)
    .eq("kind", "positive_example")
    .eq("status", "succeeded");
  return count ?? 0;
}

export function applyIcpExemplarScarcityClamp(
  state: OrchestratorState,
  succeededArtifacts: ReadonlyArray<OnboardingArtifactRow>,
  _dimensions: ReadonlyArray<Dimension>,
): void {
  void _dimensions;
  const count = countPositiveExemplars(succeededArtifacts);
  if (count === 0 || count >= 3) return;

  for (const key of ICP_EXEMPLAR_DERIVED_DIMENSIONS) {
    const dim = state.dimensions[key];
    if (!dim) continue;
    const config = ICP_DIMENSIONS.find((dimension) => dimension.key === key);
    if (!config) continue;

    const quality = calculateDimensionQuality(key, dim.value, dim.evidence);
    const nextEvidence = { ...(dim.evidence ?? {}) };
    let changed = false;
    for (const field of config.subDimensions) {
      if (quality.missingFields.includes(field)) continue;
      const current = nextEvidence[field];
      if (
        current?.strength === "direct_user_provided" ||
        current?.strength === "inferred_from_public_data"
      ) {
        continue;
      }
      nextEvidence[field] = weakScarcityEvidence(count, current);
      changed = true;
    }
    if (!changed) continue;

    const metadata = computeIcpDimensionMetadata(key, dim.value, nextEvidence);
    const suffix = `evidence remains weak: only ${count} positive exemplar${count === 1 ? "" : "s"}, not enough to call a pattern`;
    state.dimensions[key] = {
      ...dim,
      summary: dim.summary.includes("evidence remains weak")
        ? dim.summary
        : `${dim.summary} (${suffix})`,
      evidence: nextEvidence,
      evidenceCoverage: metadata.evidenceCoverage,
      missingFields: metadata.missingFields,
      weakFields: metadata.weakFields,
    };
  }
}

function weakScarcityEvidence(
  count: number,
  current: SubDimensionEvidence | undefined,
): SubDimensionEvidence {
  return {
    strength: "weak_or_unknown",
    proofPoints: current?.proofPoints ?? [],
    sources: current?.sources ?? [],
    notes:
      current?.notes ||
      `Only ${count} positive exemplar${count === 1 ? "" : "s"} available.`,
  };
}
