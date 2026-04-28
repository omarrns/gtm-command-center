import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dimension } from "@/lib/onboarding/templates/types";
import type { OnboardingArtifactRow } from "@/lib/supabase/types";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";
import { dimensionStatusFromConfidence } from "@/lib/onboarding/orchestrator/run-helpers";

const ICP_EXEMPLAR_DERIVED_DIMENSIONS = [
  "firmographics",
  "technographics",
  "signals",
] as const;

const ICP_EXEMPLAR_SCARCITY_CAP = 0.6;

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
  dimensions: ReadonlyArray<Dimension>,
): void {
  const count = countPositiveExemplars(succeededArtifacts);
  if (count === 0 || count >= 3) return;

  for (const key of ICP_EXEMPLAR_DERIVED_DIMENSIONS) {
    const dim = state.dimensions[key];
    if (!dim) continue;
    if (dim.confidence <= ICP_EXEMPLAR_SCARCITY_CAP) continue;
    const dimDef = dimensions.find((d) => d.key === key);
    if (!dimDef) continue;

    state.dimensions[key] = {
      ...dim,
      confidence: ICP_EXEMPLAR_SCARCITY_CAP,
      summary: `${dim.summary} (capped at ${ICP_EXEMPLAR_SCARCITY_CAP} — only ${count} positive exemplar${count === 1 ? "" : "s"}, not enough to call a pattern)`,
      status: dimensionStatusFromConfidence(
        ICP_EXEMPLAR_SCARCITY_CAP,
        dimDef.confidenceThreshold,
        false,
      ),
    };
  }
}
