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
  confidence: number;
  threshold: number;
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
