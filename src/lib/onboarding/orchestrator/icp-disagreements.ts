// SPEC-3 Phase 5.b: surface dimensions where the user's declared ICP
// disagrees with what the exemplars suggest.
//
// The orchestrator emits a single synthesized value per dimension, so
// "declared vs inferred" isn't structurally separable post-hoc. We
// approximate by joining each dimension's provenance entries to their
// originating artifact kind:
//
//   declared    = company_context | buyer_persona
//   inferred    = positive_example | negative_example
//
// A dimension that drew from BOTH source kinds had to be reconciled by
// the orchestrator. A disagreement is flagged only when BOTH provenance
// is mixed AND the orchestrator's summary contains a reconciliation
// keyword ("however", "but", "conflict", ...). Mixed provenance alone
// is not a disagreement — the orchestrator frequently draws on both
// sources when they agree, and flagging those would wear out the user
// on the review screen.
//
// Heuristic, not ground truth — the orchestrator could improve this by
// emitting a structured `disagreements` field. For v1 this is good
// enough to draw the user's eye to fields that need a second look.

import type { OrchestratorState } from "./types";

type ProvenanceClass = "declared" | "inferred" | "unknown";

// Only the core ICP rubric dimensions are eligible. Evidence/calibration
// fields like proof_points are not conflict-routed as dimensions.
// (none today, but room for orchestrator-internal book-keeping) skip.
const ICP_DIMENSIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "product", label: "Product" },
  { key: "buyer", label: "Buyer roles" },
  { key: "firmographics", label: "Firmographics" },
  { key: "technographics", label: "Technographics" },
  { key: "signals", label: "Signals" },
  { key: "disqualifiers", label: "Disqualifiers" },
];

const HIGH_SEVERITY_KEYWORDS = [
  "conflict",
  "contradict",
  "doesn't match",
  "does not match",
  "inconsistent",
  "disagree",
];

const MEDIUM_SEVERITY_KEYWORDS = [
  "however",
  " but ",
  " except",
  "though",
  "while",
  "diverge",
  "mismatch",
];

export type DisagreementSeverity = "medium" | "high";

export interface IcpDisagreement {
  dimensionKey: string;
  label: string;
  summary: string;
  severity: DisagreementSeverity;
  declaredSources: string[];
  inferredSources: string[];
}

function classifyKind(kind: string | undefined): ProvenanceClass {
  if (kind === "company_context" || kind === "buyer_persona") return "declared";
  if (kind === "positive_example" || kind === "negative_example") {
    return "inferred";
  }
  return "unknown";
}

function detectSeverity(summary: string): DisagreementSeverity | null {
  const lower = summary.toLowerCase();
  if (HIGH_SEVERITY_KEYWORDS.some((k) => lower.includes(k))) return "high";
  if (MEDIUM_SEVERITY_KEYWORDS.some((k) => lower.includes(k))) return "medium";
  return null;
}

export function detectIcpDisagreements(
  state: OrchestratorState | null,
): IcpDisagreement[] {
  if (!state) return [];

  // artifactId → kind lookup, built once. The provenance array carries
  // artifactIds; we resolve them here so each dimension can classify its
  // own sources without the caller passing artifact rows separately.
  const kindById = new Map<string, string>();
  for (const a of state.artifacts) {
    kindById.set(a.id, a.kind);
  }

  const result: IcpDisagreement[] = [];
  for (const dim of ICP_DIMENSIONS) {
    const stateDim = state.dimensions[dim.key];
    if (!stateDim) continue;

    const declaredSources = new Set<string>();
    const inferredSources = new Set<string>();
    for (const p of stateDim.provenance) {
      const cls = classifyKind(
        p.artifactId ? kindById.get(p.artifactId) : undefined,
      );
      if (cls === "declared") declaredSources.add(p.sourceLabel);
      else if (cls === "inferred") inferredSources.add(p.sourceLabel);
    }

    if (declaredSources.size === 0 || inferredSources.size === 0) continue;

    const severity = detectSeverity(stateDim.summary);
    if (!severity) continue;

    result.push({
      dimensionKey: dim.key,
      label: dim.label,
      summary: stateDim.summary,
      severity,
      declaredSources: Array.from(declaredSources),
      inferredSources: Array.from(inferredSources),
    });
  }

  return result;
}
