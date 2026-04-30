import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Dimension,
  InterviewTemplate,
} from "@/lib/onboarding/templates/types";
import { runGenerateObject } from "@/lib/ai/calls";
import {
  changedSubDimensionKeys,
  renderPromptChecklist,
} from "@/lib/onboarding/icp-dimensions";
import { applyIcpExemplarScarcityClamp } from "@/lib/onboarding/orchestrator/icp-exemplar-scarcity";
import {
  buildUserAnswerEvidence,
  computeIcpDimensionMetadata,
  mergeIcpDimensionEvidence,
} from "@/lib/onboarding/orchestrator/icp-metadata";
import {
  buildAnalysisResultSchema,
  buildArtifactsBlock,
  buildDimensionsBlock,
  computeNextKey,
  dimensionStatusFromConfidence,
  loadArtifactsForInterview,
  singleDimensionResultSchema,
} from "@/lib/onboarding/orchestrator/run-helpers";
import type { OrchestratorProvenance, OrchestratorState } from "./types";
import { emptyOrchestratorState } from "./types";

type AgenticTemplate = Extract<InterviewTemplate, { agenticMode: true }>;

export {
  applyIcpExemplarScarcityClamp,
  countPositiveExemplars,
  loadPositiveExemplarCount,
} from "@/lib/onboarding/orchestrator/icp-exemplar-scarcity";

/**
 * Read all succeeded artifacts for this interview, call Opus to produce a
 * per-dimension confidence map, merge into orchestrator_state.
 * Runs after each new artifact lands.
 */
export async function analyzeArtifacts(
  interviewId: string,
  svc: SupabaseClient,
  template: AgenticTemplate,
  ctx: {
    isRefresh: boolean;
    existingProfile?: string;
    analysisRunId?: string;
  },
): Promise<OrchestratorState> {
  const allArtifacts = await loadArtifactsForInterview(svc, interviewId);
  const succeeded = allArtifacts.filter((a) => a.status === "succeeded");
  const failed = allArtifacts.filter((a) => a.status === "failed");

  // Load current state so we can preserve answered dimensions and the
  // asked-keys history across re-analyses.
  const { data: interviewRow, error: interviewErr } = await svc
    .from("onboarding_interviews")
    .select("orchestrator_state")
    .eq("id", interviewId)
    .single();
  if (interviewErr || !interviewRow) {
    throw new Error(
      `Failed to load interview: ${interviewErr?.message ?? "not found"}`,
    );
  }

  const prior =
    (interviewRow.orchestrator_state as OrchestratorState | null) ??
    emptyOrchestratorState(template.id);
  const metrics = {
    ...prior.metrics,
    artifactSuccessCount: succeeded.length,
    artifactFailureCount: failed.length,
    currentAnalysisRunId: ctx.analysisRunId,
  };
  if (!ctx.analysisRunId) {
    delete metrics.currentAnalysisRunId;
  }

  const next: OrchestratorState = {
    ...prior,
    templateId: template.id,
    status: "analyzing",
    // Manifest includes ALL artifacts (succeeded + failed) so the status
    // panel can surface failures after the user enters the chat phase.
    artifacts: allArtifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      sourceType: a.source_type,
      sourceLabel: a.source_label ?? undefined,
      sourceUrl: a.source_url ?? undefined,
      status: a.status,
      errorMessage: a.error_message ?? undefined,
    })),
    metrics,
  };

  if (succeeded.length === 0) {
    // No succeeded artifacts to analyze. Interviewer will ask every
    // dimension. Failures are still in the manifest for UI visibility.
    next.status = "interviewing";
    next.nextDimensionKey = computeNextKey(next, template);
    await persistState(svc, interviewId, next, ctx.analysisRunId);
    return next;
  }

  const dimensionInstructions =
    template.id === "icp_definition"
      ? renderPromptChecklist({ mode: "compact_extraction" })
      : buildDimensionsBlock(template.dimensions);
  const prompt = [
    `<artifacts>\n${buildArtifactsBlock(succeeded)}\n</artifacts>`,
    `<dimensions>\n${dimensionInstructions}\n</dimensions>`,
    ctx.existingProfile
      ? `<existing_profile>\n${ctx.existingProfile}\n</existing_profile>`
      : "",
    `For each dimension, infer a value from the artifacts. Produce:`,
    `- **value**: your best-guess value for the dimension`,
    `- **summary**: one-line plain-English rationale for a user-facing status panel`,
    template.id === "icp_definition"
      ? `- **evidence**: per sub-field evidence metadata with strength, proofPoints, sources, and notes. Use weak_or_unknown when support is thin.`
      : `- **confidence**: optional 0–1 legacy score. High (>0.8) only when artifact evidence directly supports it. Low (<0.5) when guessing.`,
    `- **provenance**: cite the artifact id + a short quote when possible.`,
    `Return an entry for EVERY dimension, even weak guesses.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const object = await runGenerateObject({
    model: template.orchestratorModel,
    system: template.orchestratorSystemPrompt({
      isRefresh: ctx.isRefresh,
      existingProfile: ctx.existingProfile,
    }),
    prompt,
    schema: buildAnalysisResultSchema(template.dimensions),
    maxOutputTokens: template.orchestratorMaxOutputTokens,
    scope: {
      scopeTable: "onboarding_interviews",
      scopeId: interviewId,
      callPurpose: "orchestrator.analyze",
    },
  });

  const now = new Date().toISOString();

  for (const dim of template.dimensions) {
    const analyzed = object.dimensions[dim.key];
    const existing = prior.dimensions[dim.key];

    // Never downgrade a dimension the user has explicitly answered.
    if (existing?.status === "answered" || existing?.status === "confirmed") {
      next.dimensions[dim.key] = existing;
      continue;
    }

    if (!analyzed) {
      next.dimensions[dim.key] = existing ?? {
        value: null,
        summary: "Not yet inferred from artifacts.",
        confidence: 0,
        threshold: dim.confidenceThreshold,
        status: "unknown",
        provenance: [],
        updatedAt: now,
      };
      continue;
    }

    const provenance: OrchestratorProvenance[] = analyzed.provenance.map(
      (p) => ({
        artifactId: p.artifactId,
        sourceLabel: p.sourceLabel,
        quote: p.quote,
      }),
    );

    const evidence =
      template.id === "icp_definition"
        ? mergeIcpDimensionEvidence(dim.key, analyzed.evidence)
        : undefined;
    const icpMetadata =
      template.id === "icp_definition"
        ? computeIcpDimensionMetadata(dim.key, analyzed.value, evidence)
        : null;
    const confidence = icpMetadata?.confidence ?? analyzed.confidence ?? 0;

    next.dimensions[dim.key] = {
      value: analyzed.value,
      summary: analyzed.summary,
      // ICP confidence is computed completeness, not model-reported confidence.
      confidence,
      threshold: dim.confidenceThreshold,
      status: dimensionStatusFromConfidence(
        confidence,
        dim.confidenceThreshold,
        false,
      ),
      ...(icpMetadata
        ? {
            evidenceCoverage: icpMetadata.evidenceCoverage,
            missingFields: icpMetadata.missingFields,
            weakFields: icpMetadata.weakFields,
            ...(evidence ? { evidence } : {}),
          }
        : {}),
      provenance,
      updatedAt: now,
    };
  }

  if (template.id === "icp_definition") {
    applyIcpExemplarScarcityClamp(next, succeeded, template.dimensions);
  }

  next.status = "interviewing";
  next.nextDimensionKey = computeNextKey(next, template);

  await persistState(svc, interviewId, next, ctx.analysisRunId);
  return next;
}

/**
 * Called after each interviewer turn with the user's answer. Narrow Opus
 * call targeted at one dimension. Updates that dimension's value, summary,
 * and confidence; records the user message as provenance.
 */
export async function updateDimensionFromAnswer(
  interviewId: string,
  dimensionKey: string,
  userAnswer: string,
  messageId: string,
  svc: SupabaseClient,
  template: AgenticTemplate,
): Promise<OrchestratorState> {
  const { data: interviewRow, error: interviewErr } = await svc
    .from("onboarding_interviews")
    .select("orchestrator_state")
    .eq("id", interviewId)
    .single();
  if (interviewErr || !interviewRow) {
    throw new Error(
      `Failed to load interview: ${interviewErr?.message ?? "not found"}`,
    );
  }

  const prior =
    (interviewRow.orchestrator_state as OrchestratorState | null) ??
    emptyOrchestratorState(template.id);

  const dim = template.dimensions.find((d) => d.key === dimensionKey);
  if (!dim) {
    throw new Error(`Unknown dimension key: ${dimensionKey}`);
  }

  const priorSummary =
    prior.dimensions[dimensionKey]?.summary ?? "No prior inference.";
  const priorValue = JSON.stringify(
    prior.dimensions[dimensionKey]?.value ?? null,
  );

  const prompt = [
    `<dimension key="${dim.key}">${dim.description}</dimension>`,
    `<prior_inference>${priorSummary}\nValue: ${priorValue}</prior_inference>`,
    `<user_answer>\n${userAnswer}\n</user_answer>`,
    template.id === "icp_definition"
      ? `Update the dimension based on the user's answer. The user is the source of truth. Return updated value, summary, and evidence metadata for changed sub-fields.`
      : `Update the dimension based on the user's answer. Return updated value, summary, and optional legacy confidence.`,
  ].join("\n\n");

  const object = await runGenerateObject({
    model: template.orchestratorModel,
    system: template.orchestratorSystemPrompt({ isRefresh: false }),
    prompt,
    schema: singleDimensionResultSchema,
    // 2048 tokens covers one dimension's value + summary + per-sub-dim
    // evidence (largest case is firmographics' 5 sub-dims with full
    // {strength, proofPoints, sources[], notes} each). The pre-Phase-3
    // cap of 512 was sized for the value-only schema and started
    // truncating once Phase 3 added evidence — model hit max_tokens
    // mid-JSON, AI SDK returned `{}`, Zod rejected for missing summary.
    maxOutputTokens: 2048,
    scope: {
      scopeTable: "onboarding_interviews",
      scopeId: interviewId,
      callPurpose: "orchestrator.update_dimension",
    },
  });

  const now = new Date().toISOString();
  const existing = prior.dimensions[dimensionKey];
  const provenance: OrchestratorProvenance[] = [
    ...(existing?.provenance ?? []),
    {
      messageId,
      sourceLabel: "user answer",
      note: userAnswer.slice(0, 240),
    },
  ];

  const changedFields =
    template.id === "icp_definition" && existing
      ? changedSubDimensionKeys(dimensionKey, existing.value, object.value)
      : [];
  const userEvidence =
    template.id === "icp_definition"
      ? buildUserAnswerEvidence(
          dimensionKey,
          changedFields,
          messageId,
          userAnswer,
        )
      : undefined;
  const evidence =
    template.id === "icp_definition"
      ? mergeIcpDimensionEvidence(
          dimensionKey,
          existing?.evidence,
          object.evidence,
          userEvidence,
        )
      : undefined;
  const icpMetadata =
    template.id === "icp_definition"
      ? computeIcpDimensionMetadata(dimensionKey, object.value, evidence)
      : null;
  const confirmedWeakFields = changedFields.filter((field) =>
    existing?.weakFields?.includes(field),
  );
  const confidence = icpMetadata?.confidence ?? object.confidence ?? 0;

  const nextDimensions = {
    ...prior.dimensions,
    [dimensionKey]: {
      value: object.value,
      summary: object.summary,
      // ICP confidence is computed completeness, not model-reported confidence.
      confidence,
      threshold: dim.confidenceThreshold,
      status: "answered" as const,
      ...(icpMetadata
        ? {
            evidenceCoverage: icpMetadata.evidenceCoverage,
            missingFields: icpMetadata.missingFields,
            weakFields: icpMetadata.weakFields,
            confirmedWeakFields,
            ...(evidence ? { evidence } : {}),
          }
        : {}),
      provenance,
      updatedAt: now,
    },
  };

  const next: OrchestratorState = {
    ...prior,
    dimensions: nextDimensions,
    activeDimensionKey: null,
  };
  next.nextDimensionKey = computeNextKey(next, template);

  if (!next.nextDimensionKey) {
    next.status = "ready_for_review";
  }

  await persistState(svc, interviewId, next);
  return next;
}

/**
 * Pure function. Returns the dimension the interviewer should ask next, or
 * null if every dimension is above its threshold (or already asked).
 */
export function nextDimensionToAsk(
  state: OrchestratorState,
  template: AgenticTemplate,
): Dimension | null {
  const key = computeNextKey(state, template);
  if (!key) return null;
  return template.dimensions.find((d) => d.key === key) ?? null;
}

async function persistState(
  svc: SupabaseClient,
  interviewId: string,
  state: OrchestratorState,
  expectedAnalysisRunId?: string,
): Promise<void> {
  let query = svc
    .from("onboarding_interviews")
    .update({
      orchestrator_state: state,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId);

  if (expectedAnalysisRunId) {
    query = query.filter(
      "orchestrator_state->metrics->>currentAnalysisRunId",
      "eq",
      expectedAnalysisRunId,
    );
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(`Failed to persist orchestrator_state: ${error.message}`);
  }
  if (expectedAnalysisRunId && (!data || data.length === 0)) {
    throw new StaleOrchestratorAnalysisError(expectedAnalysisRunId);
  }
}

export class StaleOrchestratorAnalysisError extends Error {
  constructor(analysisRunId: string) {
    super(`Stale orchestrator analysis skipped: ${analysisRunId}`);
    this.name = "StaleOrchestratorAnalysisError";
  }
}
