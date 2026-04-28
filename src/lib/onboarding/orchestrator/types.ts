import type { InterviewTemplateId } from "../templates/types";

export type OrchestratorStatus =
  | "empty"
  | "analyzing"
  | "interviewing"
  | "ready_for_review"
  | "failed";

export type ArtifactManifestStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed";

export type ArtifactSourceType = "url" | "file" | "text";

export type DimensionStatus =
  | "unknown"
  | "inferred"
  | "needs_question"
  | "answered"
  | "confirmed";

export interface OrchestratorArtifactRef {
  id: string;
  kind: string;
  sourceType: ArtifactSourceType;
  sourceLabel?: string;
  sourceUrl?: string;
  status: ArtifactManifestStatus;
  errorMessage?: string;
}

export interface OrchestratorProvenance {
  artifactId?: string;
  messageId?: string;
  sourceLabel: string;
  quote?: string;
  note?: string;
}

export interface OrchestratorDimension {
  value: unknown;
  summary: string;
  // Computed completeness confidence, not model-reported confidence.
  // ICP Phase 2+ treats this as filled sub-dimensions / total sub-dimensions.
  confidence: number;
  threshold: number;
  evidenceCoverage?: number;
  missingFields?: string[];
  weakFields?: string[];
  confirmedWeakFields?: string[];
  status: DimensionStatus;
  provenance: OrchestratorProvenance[];
  updatedAt: string;
}

export interface OrchestratorReviewEdit {
  dimensionKey: string;
  previousValue: unknown;
  editedValue: unknown;
  previousConfidence: number;
}

export interface OrchestratorMetrics {
  questionCount: number;
  artifactSuccessCount: number;
  artifactFailureCount: number;
  reviewEdits: OrchestratorReviewEdit[];
}

export interface OrchestratorState {
  version: 1;
  templateId: InterviewTemplateId;
  status: OrchestratorStatus;
  artifacts: OrchestratorArtifactRef[];
  dimensions: Record<string, OrchestratorDimension>;
  activeDimensionKey: string | null;
  nextDimensionKey: string | null;
  askedDimensionKeys: string[];
  metrics: OrchestratorMetrics;
}

export function emptyOrchestratorState(
  templateId: InterviewTemplateId,
): OrchestratorState {
  return {
    version: 1,
    templateId,
    status: "empty",
    artifacts: [],
    dimensions: {},
    activeDimensionKey: null,
    nextDimensionKey: null,
    askedDimensionKeys: [],
    metrics: {
      questionCount: 0,
      artifactSuccessCount: 0,
      artifactFailureCount: 0,
      reviewEdits: [],
    },
  };
}

/**
 * Dimensions whose final confidence is still below threshold — the orchestrator
 * tried to resolve them (possibly via re-ask at the 2-ask cap) but the answer
 * was ambiguous enough that the confidence stayed low. The review UI surfaces
 * these so the user knows which fields to double-check.
 */
export function getLowConfidenceDimensions(
  state: OrchestratorState | null,
  dimensionProjection: ReadonlyArray<{ key: string; label: string }>,
): Array<{ key: string; label: string; confidence: number }> {
  if (!state) return [];
  const result: Array<{ key: string; label: string; confidence: number }> = [];
  for (const projected of dimensionProjection) {
    const dim = state.dimensions[projected.key];
    if (!dim) continue;
    if (dim.status !== "answered") continue;
    if (dim.confidence < dim.threshold) {
      result.push({
        key: projected.key,
        label: projected.label,
        confidence: dim.confidence,
      });
    }
  }
  return result;
}
