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
import { ICP_DIMENSIONS } from "@/lib/onboarding/icp-dimensions";

type ProvenanceClass = "declared" | "inferred" | "unknown";

// Only the core ICP rubric dimensions are eligible. Evidence/calibration
// fields like proof_points are not conflict-routed as dimensions.
// (none today, but room for orchestrator-internal book-keeping) skip.
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
  result.push(...detectStructuredConflicts(state));
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

function detectStructuredConflicts(state: OrchestratorState): IcpDisagreement[] {
  const result: IcpDisagreement[] = [];
  const tech = asRecord(state.dimensions.technographics?.value);
  const disq = asRecord(state.dimensions.disqualifiers?.value);

  const requiredTools = stringArray(tech?.required_tools);
  const excludedTools = stringArray(tech?.excluded_tools);
  const techDisqualifiers = stringArray(disq?.tech_disqualifiers);
  const requiredExcludedOverlap = overlap(requiredTools, excludedTools);
  const requiredDisqualifiedOverlap = overlap(requiredTools, techDisqualifiers);
  const toolOverlap = unique([
    ...requiredExcludedOverlap,
    ...requiredDisqualifiedOverlap,
  ]);

  if (toolOverlap.length > 0) {
    result.push({
      dimensionKey: "technographics",
      label: "Technographics",
      summary: `Required tools also appear as excluded or disqualified: ${toolOverlap.join(", ")}`,
      severity: "high",
      declaredSources: ["technographics.required_tools"],
      inferredSources: [
        requiredExcludedOverlap.length > 0
          ? "technographics.excluded_tools"
          : "disqualifiers.tech_disqualifiers",
      ],
    });
  }

  const stages = stringArray(asRecord(state.dimensions.firmographics?.value)?.stages);
  const stageDisqualifiers = stringArray(disq?.stage_disqualifiers);
  const stageOverlap = overlap(stages, stageDisqualifiers);
  if (stageOverlap.length > 0) {
    result.push({
      dimensionKey: "firmographics",
      label: "Firmographics",
      summary: `Target stages also appear as stage disqualifiers: ${stageOverlap.join(", ")}`,
      severity: "high",
      declaredSources: ["firmographics.stages"],
      inferredSources: ["disqualifiers.stage_disqualifiers"],
    });
  }

  return result;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function overlap(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map(normalize));
  return unique(left.filter((entry) => rightSet.has(normalize(entry))));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
