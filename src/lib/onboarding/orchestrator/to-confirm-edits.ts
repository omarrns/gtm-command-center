import type { JobSearchEdits } from "@/lib/onboarding/templates/job-search";
import type { OrchestratorReviewEdit, OrchestratorState } from "./types";

export interface ConfirmEditsAdapterResult {
  edits: JobSearchEdits;
  reviewEdits: OrchestratorReviewEdit[];
}

// Per-field readers with type coercion + fallback. Keeping these small and
// local to the adapter makes the 13-field mapping easy to audit.

function getString(
  state: OrchestratorState,
  key: string,
  fallback = "",
): string {
  const v = state.dimensions[key]?.value;
  if (typeof v === "string") return v;
  // Orchestrator naturally emits bullet-style dimensions (careerHighlights,
  // proofPoints, greenFlags, etc.) as JSON arrays even though the rubric
  // expects a markdown-bullet string. Coerce so the review textarea renders
  // editable content instead of blank.
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
    return v.map((line) => `- ${line}`).join("\n");
  }
  return fallback;
}

function getStringArray(
  state: OrchestratorState,
  key: string,
  fallback: string[],
): string[] {
  const v = state.dimensions[key]?.value;
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
  return fallback;
}

function getNumber(
  state: OrchestratorState,
  key: string,
  fallback: number,
): number {
  const v = state.dimensions[key]?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function getTone(
  state: OrchestratorState,
  key: string,
): "casual" | "direct" | "formal" {
  const v = state.dimensions[key]?.value;
  if (v === "casual" || v === "direct" || v === "formal") return v;
  return "casual";
}

/**
 * Build the orchestrator's view of a JobSearchEdits — what it would confirm
 * if the user made no review edits. Dimensions the orchestrator didn't infer
 * fall back to conservative defaults (empty strings, safe numeric caps).
 */
function orchestratorEdits(state: OrchestratorState): JobSearchEdits {
  return {
    profile: {
      positioning: getString(state, "positioning"),
      careerHighlights: getString(state, "careerHighlights"),
      proofPoints: getString(state, "proofPoints"),
      technicalTools: getString(state, "technicalTools"),
    },
    search: {
      searchQueries: getStringArray(state, "searchQueries", [
        "Software Engineer",
      ]),
      searchLocations: getStringArray(state, "searchLocations", ["Remote"]),
      scoreThreshold: getNumber(state, "scoreThreshold", 70),
      dailySendCap: getNumber(state, "dailySendCap", 10),
    },
    outreach: {
      greenFlags: getString(state, "greenFlags"),
      redFlags: getString(state, "redFlags"),
      outreachTone: getTone(state, "outreachTone"),
      whatsWorked: getString(state, "whatsWorked"),
      whatToAvoid: getString(state, "whatToAvoid"),
    },
  };
}

function equalValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return false;
}

function diffForMetrics(
  state: OrchestratorState,
  orchestrator: JobSearchEdits,
  finalEdits: JobSearchEdits,
): OrchestratorReviewEdit[] {
  const result: OrchestratorReviewEdit[] = [];

  const pairs: Array<{
    key: string;
    prev: unknown;
    next: unknown;
  }> = [
    {
      key: "positioning",
      prev: orchestrator.profile.positioning,
      next: finalEdits.profile.positioning,
    },
    {
      key: "careerHighlights",
      prev: orchestrator.profile.careerHighlights,
      next: finalEdits.profile.careerHighlights,
    },
    {
      key: "proofPoints",
      prev: orchestrator.profile.proofPoints,
      next: finalEdits.profile.proofPoints,
    },
    {
      key: "technicalTools",
      prev: orchestrator.profile.technicalTools,
      next: finalEdits.profile.technicalTools,
    },
    {
      key: "searchQueries",
      prev: orchestrator.search.searchQueries,
      next: finalEdits.search.searchQueries,
    },
    {
      key: "searchLocations",
      prev: orchestrator.search.searchLocations,
      next: finalEdits.search.searchLocations,
    },
    {
      key: "scoreThreshold",
      prev: orchestrator.search.scoreThreshold,
      next: finalEdits.search.scoreThreshold,
    },
    {
      key: "dailySendCap",
      prev: orchestrator.search.dailySendCap,
      next: finalEdits.search.dailySendCap,
    },
    {
      key: "greenFlags",
      prev: orchestrator.outreach.greenFlags,
      next: finalEdits.outreach.greenFlags,
    },
    {
      key: "redFlags",
      prev: orchestrator.outreach.redFlags,
      next: finalEdits.outreach.redFlags,
    },
    {
      key: "outreachTone",
      prev: orchestrator.outreach.outreachTone,
      next: finalEdits.outreach.outreachTone,
    },
    {
      key: "whatsWorked",
      prev: orchestrator.outreach.whatsWorked,
      next: finalEdits.outreach.whatsWorked,
    },
    {
      key: "whatToAvoid",
      prev: orchestrator.outreach.whatToAvoid,
      next: finalEdits.outreach.whatToAvoid,
    },
  ];

  for (const pair of pairs) {
    if (equalValue(pair.prev, pair.next)) continue;
    const prior = state.dimensions[pair.key];
    result.push({
      dimensionKey: pair.key,
      previousValue: pair.prev,
      editedValue: pair.next,
      previousConfidence: prior?.confidence ?? 0,
    });
  }

  return result;
}

/**
 * Map OrchestratorState (+ optional user edits from the review screen) onto
 * the JobSearchEdits shape that performConfirm already consumes. Review
 * edits override orchestrator values field-by-field and produce a metrics
 * diff so we can track which inferences the user corrected.
 */
export function toJobSearchConfirmEdits(
  state: OrchestratorState,
  finalEdits?: JobSearchEdits,
): ConfirmEditsAdapterResult {
  const orchestrator = orchestratorEdits(state);

  if (!finalEdits) {
    return { edits: orchestrator, reviewEdits: [] };
  }

  const reviewEdits = diffForMetrics(state, orchestrator, finalEdits);
  return { edits: finalEdits, reviewEdits };
}
