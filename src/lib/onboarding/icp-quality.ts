import {
  ICP_DIMENSIONS,
  type CoreIcpDimensionKey,
} from "@/lib/onboarding/icp-dimension-config";
import {
  coerceIcpRubric,
  getDefaultEvidence,
} from "@/lib/onboarding/icp-dimensions";
import type {
  CoreIcpRubric,
  SubDimensionEvidence,
} from "@/lib/onboarding/icp-types";

const DEFAULT_EMPLOYEE_MAX = 10000;
const DEFAULT_EVIDENCE_COVERAGE_THRESHOLD = 0.7;

export interface DimensionQuality {
  completeness: number;
  evidenceCoverage: number;
  missingFields: string[];
  weakFields: string[];
}

export interface SkipDimensionInput {
  value: unknown;
  threshold: number;
  evidenceCoverage?: number;
  missingFields?: string[];
  weakFields?: string[];
  confirmedWeakFields?: string[];
}

export type PromptChecklistMode =
  | "compact_extraction"
  | "focused_interview"
  | "full_scoring";

export function getCoreDimensionKeys(): CoreIcpDimensionKey[] {
  return ICP_DIMENSIONS.map((dimension) => dimension.key);
}

export function calculateCompleteness(
  dimensionKey: CoreIcpDimensionKey | string,
  value: unknown,
): number {
  return calculateDimensionQuality(dimensionKey, value).completeness;
}

export function calculateEvidenceCoverage(
  dimensionKey: CoreIcpDimensionKey | string,
  value: unknown,
  evidence?: unknown,
): number {
  return calculateDimensionQuality(dimensionKey, value, evidence)
    .evidenceCoverage;
}

export function calculateDimensionQuality(
  dimensionKey: CoreIcpDimensionKey | string,
  value: unknown,
  evidence?: unknown,
): DimensionQuality {
  const config = ICP_DIMENSIONS.find(
    (dimension) => dimension.key === dimensionKey,
  );
  if (!config) {
    return {
      completeness: 0,
      evidenceCoverage: 0,
      missingFields: [],
      weakFields: [],
    };
  }

  const dimensionValue = normalizeDimensionValue(config.key, value);
  const dimensionEvidence = normalizeDimensionEvidence(config.key, evidence);
  const missingFields: string[] = [];
  const weakFields: string[] = [];
  let completeCount = 0;
  let coveredEvidenceCount = 0;

  for (const field of config.subDimensions) {
    const fieldValue = fieldValueForDimension(
      config.key,
      dimensionValue,
      field,
    );
    const meaningful = hasMeaningfulFieldValue(fieldValue);
    if (meaningful) {
      completeCount++;
    } else {
      missingFields.push(field);
    }

    const fieldEvidence = dimensionEvidence[field];
    if (meaningful && fieldEvidence?.strength !== "weak_or_unknown") {
      coveredEvidenceCount++;
    }
    if (meaningful && fieldEvidence?.strength === "weak_or_unknown") {
      weakFields.push(field);
    }
  }

  const total = config.subDimensions.length || 1;
  return {
    completeness: completeCount / total,
    evidenceCoverage: coveredEvidenceCount / total,
    missingFields,
    weakFields,
  };
}

export function shouldSkipDimension(
  dimensionKey: CoreIcpDimensionKey | string,
  input: SkipDimensionInput,
): boolean {
  const config = ICP_DIMENSIONS.find(
    (dimension) => dimension.key === dimensionKey,
  );
  if (!config) return false;

  const quality = calculateDimensionQuality(config.key, input.value);
  const weakFields = input.weakFields ?? quality.weakFields;
  const hasLegacyMetadata =
    input.evidenceCoverage === undefined ||
    input.missingFields === undefined ||
    input.weakFields === undefined;

  if (hasLegacyMetadata && weakFields.length > 0) return false;

  const completeness = quality.completeness;
  const evidenceCoverage =
    input.evidenceCoverage ??
    (weakFields.length === 0 ? quality.evidenceCoverage : 0);
  const confirmed = new Set(input.confirmedWeakFields ?? []);
  const unconfirmedWeakFields = weakFields.filter(
    (field) => !confirmed.has(field),
  );
  const weakFieldsSatisfied =
    unconfirmedWeakFields.length === 0 && weakFields.length > 0;

  return (
    completeness >= input.threshold &&
    (evidenceCoverage >= DEFAULT_EVIDENCE_COVERAGE_THRESHOLD ||
      weakFieldsSatisfied)
  );
}

export function changedSubDimensionKeys(
  dimensionKey: CoreIcpDimensionKey | string,
  before: unknown,
  after: unknown,
): string[] {
  const config = ICP_DIMENSIONS.find(
    (dimension) => dimension.key === dimensionKey,
  );
  if (!config) return [];

  const beforeValue = normalizeDimensionValue(config.key, before);
  const afterValue = normalizeDimensionValue(config.key, after);
  return config.subDimensions.filter((field) => {
    const previous = fieldValueForDimension(config.key, beforeValue, field);
    const next = fieldValueForDimension(config.key, afterValue, field);
    return JSON.stringify(previous) !== JSON.stringify(next);
  });
}

export function hasMeaningfulDimensionValue(
  dimensionKey: CoreIcpDimensionKey | string,
  value: unknown,
): boolean {
  return calculateCompleteness(dimensionKey, value) > 0;
}

export function renderDimensionValue(
  dimensionKey: CoreIcpDimensionKey | string,
  value: unknown,
): string | null {
  const config = ICP_DIMENSIONS.find(
    (dimension) => dimension.key === dimensionKey,
  );
  if (!config) return null;
  const dimensionValue = normalizeDimensionValue(config.key, value);
  return config.subDimensions
    .map((field) => {
      const rendered = renderFieldValue(
        fieldValueForDimension(config.key, dimensionValue, field),
      );
      return `- **${labelForField(field)}**: ${rendered}`;
    })
    .join("\n");
}

export function renderPromptChecklist(opts: {
  mode: PromptChecklistMode;
  dimensionKey?: CoreIcpDimensionKey | string;
}): string {
  const dimensions = opts.dimensionKey
    ? ICP_DIMENSIONS.filter((dimension) => dimension.key === opts.dimensionKey)
    : ICP_DIMENSIONS;
  const detail =
    opts.mode === "compact_extraction"
      ? "Return only these configured sub-fields."
      : opts.mode === "focused_interview"
        ? "Confirm or correct the weakest configured sub-field."
        : "Score each account against every configured sub-field.";

  return dimensions
    .map(
      (dimension) =>
        `## ${dimension.label}\n${detail}\n${dimension.subDimensions
          .map((field) => `- ${field}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

function normalizeDimensionValue(
  dimensionKey: CoreIcpDimensionKey,
  value: unknown,
): CoreIcpRubric[CoreIcpDimensionKey] {
  return coerceIcpRubric({ [dimensionKey]: value })[dimensionKey];
}

// Accepts either:
//   • per-dim evidence keyed by sub-dim name (`{category: {strength,...}, ...}`)
//   • the full top-level IcpEvidence keyed by dim name (the test fixture passes
//     `reparsed.evidence`, which is the legacy shape).
//
// We detect "looks like top-level" by checking whether the input has a key
// matching the requested dimensionKey. If yes, unwrap one level. Otherwise
// treat the input as already per-dim. Bug surfaced in Phase 7: the
// orchestrator passes `dim.evidence` (per-dim) but the previous code
// always did `evidence[dimensionKey]` and got undefined → fell back to
// defaults → every chip rendered as weak even when the model emitted
// strong evidence.
function normalizeDimensionEvidence(
  dimensionKey: CoreIcpDimensionKey,
  evidence: unknown,
): Record<string, SubDimensionEvidence> {
  if (
    typeof evidence === "object" &&
    evidence !== null &&
    !Array.isArray(evidence)
  ) {
    const record = evidence as Record<string, unknown>;
    const wrapped = record[dimensionKey];
    if (
      typeof wrapped === "object" &&
      wrapped !== null &&
      !Array.isArray(wrapped)
    ) {
      return wrapped as Record<string, SubDimensionEvidence>;
    }
    return record as Record<string, SubDimensionEvidence>;
  }
  return getDefaultEvidence()[dimensionKey] as Record<
    string,
    SubDimensionEvidence
  >;
}

function fieldValueForDimension(
  dimensionKey: CoreIcpDimensionKey,
  dimensionValue: CoreIcpRubric[CoreIcpDimensionKey],
  field: string,
): unknown {
  return (dimensionValue as unknown as Record<string, unknown>)[field];
}

function hasMeaningfulFieldValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) {
    return value.some(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
  }
  if (typeof value === "object" && value !== null) {
    const range = value as { min?: unknown; max?: unknown };
    if (typeof range.min === "number" && range.min > 0) return true;
    if (
      typeof range.max === "number" &&
      range.max > 0 &&
      range.max < DEFAULT_EMPLOYEE_MAX
    ) {
      return true;
    }
  }
  return false;
}

function renderFieldValue(value: unknown): string {
  if (typeof value === "string") return value.trim() || "(not set)";
  if (Array.isArray(value)) {
    const filtered = value.filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
    );
    return filtered.length ? filtered.join(", ") : "(none)";
  }
  if (typeof value === "object" && value !== null) {
    const range = value as { min?: unknown; max?: unknown };
    if (typeof range.min === "number" || typeof range.max === "number") {
      const max =
        typeof range.max === "number"
          ? String(range.max)
          : range.max === null
            ? "(unbounded)"
            : String(DEFAULT_EMPLOYEE_MAX);
      return `${typeof range.min === "number" ? range.min : 0}-${max}`;
    }
  }
  return "(not set)";
}

function labelForField(field: string): string {
  return field
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
