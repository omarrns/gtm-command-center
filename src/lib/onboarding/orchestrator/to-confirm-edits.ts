import type { JobSearchEdits } from "@/lib/onboarding/templates/job-search";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";
import type { InterviewTemplate } from "@/lib/onboarding/templates/types";
import type { OrchestratorReviewEdit, OrchestratorState } from "./types";

export interface ConfirmEditsAdapterResult<E> {
  edits: E;
  reviewEdits: OrchestratorReviewEdit[];
}

// ── Per-field readers (shared by both adapters) ────────────────────────────

function getString(
  state: OrchestratorState,
  key: string,
  fallback = "",
): string {
  const v = state.dimensions[key]?.value;
  if (typeof v === "string") return v;
  // Orchestrator naturally emits bullet-style dimensions as JSON arrays even
  // when the rubric expects a markdown-bullet string. Coerce so the review
  // textarea renders editable content instead of blank.
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

function getObject<T extends Record<string, unknown>>(
  state: OrchestratorState,
  key: string,
  fallback: T,
): T {
  const v = state.dimensions[key]?.value;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    // Shallow merge fallback over orchestrator-provided keys so missing
    // sub-fields default cleanly.
    return { ...fallback, ...(v as Partial<T>) };
  }
  return fallback;
}

function equalValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  // Shallow object equality for nested ICP sections is intentionally
  // skipped — diffForMetrics flags any object as edited if the user
  // touched the section. Good enough for review-edit telemetry.
  return false;
}

function diffForMetrics(
  state: OrchestratorState,
  pairs: Array<{ key: string; prev: unknown; next: unknown }>,
): OrchestratorReviewEdit[] {
  const result: OrchestratorReviewEdit[] = [];
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

// ── job_search adapter ────────────────────────────────────────────────────

function orchestratorJobSearchEdits(state: OrchestratorState): JobSearchEdits {
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

export function toJobSearchConfirmEdits(
  state: OrchestratorState,
  finalEdits?: JobSearchEdits,
): ConfirmEditsAdapterResult<JobSearchEdits> {
  const orchestrator = orchestratorJobSearchEdits(state);
  if (!finalEdits) return { edits: orchestrator, reviewEdits: [] };

  const reviewEdits = diffForMetrics(state, [
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
  ]);
  return { edits: finalEdits, reviewEdits };
}

// ── ICP adapter ────────────────────────────────────────────────────────────

function orchestratorIcpEdits(state: OrchestratorState): IcpEdits {
  return {
    product: getObject(state, "product", {
      category: "",
      core_jtbd: "",
      wedge: "",
    }),
    icp: {
      buyer: getObject(state, "buyer", {
        economic_buyer: "",
        champion: "",
        end_user: "",
      }),
      firmographics: getObject(state, "firmographics", {
        industries: [],
        employee_range_min: 0,
        employee_range_max: 10000,
        stages: [],
        geographies: [],
      }),
      technographics: getObject(state, "technographics", {
        required_tools: [],
        excluded_tools: [],
      }),
      signals: getObject(state, "signals", {
        hiring_roles: [],
        jtbd_evidence: [],
        trigger_events: [],
      }),
      disqualifiers: getStringArray(state, "disqualifiers", []),
    },
    proof_points: getObject(state, "proof_points", {
      existing_customers: [],
      won_deals: [],
      lost_deals_reasons: [],
    }),
  };
}

export function toIcpConfirmEdits(
  state: OrchestratorState,
  finalEdits?: IcpEdits,
): ConfirmEditsAdapterResult<IcpEdits> {
  const orchestrator = orchestratorIcpEdits(state);
  if (!finalEdits) return { edits: orchestrator, reviewEdits: [] };

  // ICP review-edit diff is dimension-grained — touching any leaf inside
  // a section flags the parent dimension as edited. Cheaper than per-leaf
  // tracking and matches how the review UI groups fields.
  const reviewEdits = diffForMetrics(state, [
    { key: "product", prev: orchestrator.product, next: finalEdits.product },
    { key: "buyer", prev: orchestrator.icp.buyer, next: finalEdits.icp.buyer },
    {
      key: "firmographics",
      prev: orchestrator.icp.firmographics,
      next: finalEdits.icp.firmographics,
    },
    {
      key: "technographics",
      prev: orchestrator.icp.technographics,
      next: finalEdits.icp.technographics,
    },
    {
      key: "signals",
      prev: orchestrator.icp.signals,
      next: finalEdits.icp.signals,
    },
    {
      key: "disqualifiers",
      prev: orchestrator.icp.disqualifiers,
      next: finalEdits.icp.disqualifiers,
    },
    {
      key: "proof_points",
      prev: orchestrator.proof_points,
      next: finalEdits.proof_points,
    },
  ]);
  return { edits: finalEdits, reviewEdits };
}

// ── Template-aware dispatcher ──────────────────────────────────────────────

/**
 * Pick the right adapter for the template and return template-typed edits.
 * Replaces the per-call-site `if template.id === "job_search"` branches that
 * accumulated in interview-actions and chat/route. New templates plug in
 * here; call sites stay generic.
 */
export function toConfirmEditsForTemplate<E>(
  state: OrchestratorState,
  template: InterviewTemplate<E, unknown>,
  finalEdits?: E,
): ConfirmEditsAdapterResult<E> {
  if (template.id === "icp_definition") {
    return toIcpConfirmEdits(
      state,
      finalEdits as IcpEdits | undefined,
    ) as unknown as ConfirmEditsAdapterResult<E>;
  }
  // Default: job_search shape.
  return toJobSearchConfirmEdits(
    state,
    finalEdits as JobSearchEdits | undefined,
  ) as unknown as ConfirmEditsAdapterResult<E>;
}
