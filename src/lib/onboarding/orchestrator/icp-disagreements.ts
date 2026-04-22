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
// the orchestrator. The summary it wrote often signals reconciliation
// with words like "however", "but", "except". Severity rises with the
// strength of those signals.
//
// Heuristic, not ground truth — the orchestrator could improve this by
// emitting a structured `disagreements` field. For v1 this is good
// enough to draw the user's eye to fields that need a second look.

import type { OrchestratorState } from "./types";

type ProvenanceClass = "declared" | "inferred" | "unknown";

// Only the seven ICP rubric dimensions are eligible. Other state keys
// (none today, but room for orchestrator-internal book-keeping) skip.
const ICP_DIMENSIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "product", label: "Product" },
  { key: "buyer", label: "Buyer roles" },
  { key: "firmographics", label: "Firmographics" },
  { key: "technographics", label: "Technographics" },
  { key: "signals", label: "Signals" },
  { key: "disqualifiers", label: "Disqualifiers" },
  { key: "proof_points", label: "Proof points" },
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

export type DisagreementSeverity = "low" | "medium" | "high";

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

function detectSeverity(summary: string): DisagreementSeverity {
  const lower = summary.toLowerCase();
  if (HIGH_SEVERITY_KEYWORDS.some((k) => lower.includes(k))) return "high";
  if (MEDIUM_SEVERITY_KEYWORDS.some((k) => lower.includes(k))) return "medium";
  return "low";
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

    result.push({
      dimensionKey: dim.key,
      label: dim.label,
      summary: stateDim.summary,
      severity: detectSeverity(stateDim.summary),
      declaredSources: Array.from(declaredSources),
      inferredSources: Array.from(inferredSources),
    });
  }

  return result;
}
