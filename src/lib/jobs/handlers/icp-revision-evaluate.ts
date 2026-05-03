import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { MODELS } from "@/lib/ai/models";
import { runGenerateObject } from "@/lib/ai/calls";
import { loadIcpAgentContext } from "@/lib/icp-agent/context";
import {
  buildJudgePrompt,
  buildRevisionCriticPrompt,
} from "@/lib/icp-agent/prompts";
import {
  elapsedMs,
  errorMessage,
  recordIcpAgentEvent,
} from "@/lib/icp-agent/events";
import {
  revisionJudgeSchema,
  revisionProposalSchema,
} from "@/lib/icp-agent/schemas";
import {
  applyLiveUpdate,
  applyRevisionPatches,
  insertCandidate,
  insertCommit,
  loadBeforeSnapshot,
  loadEvidence,
  markEvidenceProcessed,
} from "@/lib/icp-agent/revisions";

export async function runIcpRevisionEvaluateJob(
  job: JobRow,
  svc: SupabaseClient,
) {
  const startedAt = Date.now();
  const evidenceIds = parseEvidenceIds(job.payload);
  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-revision-evaluate",
    status: "started",
    message: "Evaluating ICP calibration evidence for rubric or narrative updates.",
    evidenceIds,
  });

  try {
    const result = await evaluateRevision(job, svc, evidenceIds, startedAt);
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-evaluate",
      status: result.applied ? "succeeded" : "skipped",
      message: result.applied
        ? "ICP revision evaluation applied an automatic update."
        : "ICP revision evaluation completed without applying an update.",
      evidenceIds,
      candidateId: result.candidateId ?? null,
      commitId: result.commitId ?? null,
      durationMs: elapsedMs(startedAt),
      metadata: result,
    });
    return result;
  } catch (error) {
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-evaluate",
      status: "failed",
      message: "ICP revision evaluation failed.",
      evidenceIds,
      durationMs: elapsedMs(startedAt),
      error: errorMessage(error),
    });
    throw error;
  }
}

async function evaluateRevision(
  job: JobRow,
  svc: SupabaseClient,
  evidenceIds: string[],
  startedAt: number,
) {
  const evidence = await loadEvidence(svc, job.user_id, evidenceIds);
  if (evidence.length === 0) {
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-critic",
      status: "skipped",
      message: "No evidence rows were found for revision evaluation.",
      evidenceIds,
      durationMs: elapsedMs(startedAt),
    });
    return { evaluated: false, applied: false, reason: "no evidence" };
  }

  const context = await loadIcpAgentContext(svc, job.user_id);
  const criticStartedAt = Date.now();
  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-revision-critic",
    status: "started",
    message: "Critic is proposing a conservative ICP patch.",
    evidenceIds,
    model: MODELS.icpRevisionCritic,
  });
  const proposal = await runGenerateObject({
    model: MODELS.icpRevisionCritic,
    system: "Propose a narrow append-only ICP revision or decline.",
    prompt: buildRevisionCriticPrompt({ context, evidence }),
    schema: revisionProposalSchema,
    maxOutputTokens: 3072,
    scope: {
      userId: job.user_id,
      scopeTable: "icp_evidence_items",
      scopeId: evidenceIds[0],
      callPurpose: "icp-revision-critic",
    },
  });

  if (!proposal.shouldPropose || proposal.patches.length === 0) {
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-critic",
      status: "skipped",
      message: "Critic declined to propose an ICP update.",
      evidenceIds,
      model: MODELS.icpRevisionCritic,
      durationMs: elapsedMs(criticStartedAt),
      metadata: {
        target: proposal.target,
        confidence: proposal.confidence,
        reason: proposal.reason,
      },
    });
    await markEvidenceProcessed(svc, job.user_id, evidenceIds);
    return { evaluated: true, applied: false, proposed: false };
  }

  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-revision-critic",
    status: "succeeded",
    message: "Critic proposed an ICP patch.",
    evidenceIds,
    model: MODELS.icpRevisionCritic,
    durationMs: elapsedMs(criticStartedAt),
    metadata: {
      target: proposal.target,
      title: proposal.title,
      confidence: proposal.confidence,
      patchCount: proposal.patches.length,
    },
  });

  const before = await loadBeforeSnapshot(svc, job.user_id, proposal.target);
  const patchResult = applyRevisionPatches({
    target: proposal.target,
    before,
    patches: proposal.patches,
  });

  if (!patchResult.ok) {
    const candidate = await insertCandidate(svc, job.user_id, {
      status: "rejected",
      target: proposal.target,
      title: proposal.title,
      reason: patchResult.error,
      proposedPatch: { patches: proposal.patches },
      judgeResult: { approved: false, reason: patchResult.error },
      beforeSnapshot: before.snapshot,
      evidenceIds,
      confidence: proposal.confidence,
    });
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-policy",
      status: "skipped",
      message: "Proposed ICP patch failed local policy validation.",
      evidenceIds,
      candidateId: candidate.id,
      durationMs: elapsedMs(startedAt),
      error: patchResult.error,
    });
    await markEvidenceProcessed(svc, job.user_id, evidenceIds);
    return { evaluated: true, applied: false, reason: patchResult.error };
  }

  const judgeStartedAt = Date.now();
  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-revision-judge",
    status: "started",
    message: "Adversarial judge is reviewing the proposed ICP patch.",
    evidenceIds,
    model: MODELS.icpRevisionJudge,
    metadata: {
      changedPaths: patchResult.changedPaths,
      target: proposal.target,
    },
  });
  const judge = await runGenerateObject({
    model: MODELS.icpRevisionJudge,
    system: "Judge whether an automatic ICP revision is safe.",
    prompt: buildJudgePrompt({ proposal, evidence }),
    schema: revisionJudgeSchema,
    maxOutputTokens: 2048,
    scope: {
      userId: job.user_id,
      scopeTable: "icp_evidence_items",
      scopeId: evidenceIds[0],
      callPurpose: "icp-revision-judge",
    },
  });

  const approved =
    judge.approved &&
    judge.confidence >= 0.8 &&
    proposal.confidence >= 0.8 &&
    patchResult.changedPaths.length <= 5;

  const candidate = await insertCandidate(svc, job.user_id, {
    status: approved ? "applied" : "rejected",
    target: proposal.target,
    title: proposal.title,
    reason: approved ? proposal.reason : judge.reason,
    proposedPatch: { patches: proposal.patches },
    judgeResult: judge,
    beforeSnapshot: before.snapshot,
    afterSnapshot: approved ? patchResult.after : null,
    evidenceIds,
    confidence: Math.min(proposal.confidence, judge.confidence),
  });
  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-revision-judge",
    status: approved ? "succeeded" : "skipped",
    message: approved
      ? "Judge approved the ICP patch for automatic application."
      : "Judge rejected the ICP patch.",
    evidenceIds,
    candidateId: candidate.id,
    model: MODELS.icpRevisionJudge,
    durationMs: elapsedMs(judgeStartedAt),
    metadata: {
      approved: judge.approved,
      judgeConfidence: judge.confidence,
      proposalConfidence: proposal.confidence,
      reason: judge.reason,
      changedPaths: patchResult.changedPaths,
    },
  });

  let commitId: string | null = null;
  if (approved) {
    await applyLiveUpdate(svc, job.user_id, proposal.target, patchResult.after);
    commitId = await insertCommit(svc, job.user_id, {
      candidateId: candidate.id,
      target: proposal.target,
      title: proposal.title,
      reason: proposal.reason,
      changedPaths: patchResult.changedPaths,
      beforeSnapshot: before.snapshot,
      afterSnapshot: patchResult.after,
      diff: patchResult.diff,
      evidenceIds,
      confidence: Math.min(proposal.confidence, judge.confidence),
    });
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-commit",
      status: "succeeded",
      message: "Automatic ICP update committed.",
      evidenceIds,
      candidateId: candidate.id,
      commitId,
      durationMs: elapsedMs(startedAt),
      metadata: {
        target: proposal.target,
        changedPaths: patchResult.changedPaths,
      },
    });
  }

  await markEvidenceProcessed(svc, job.user_id, evidenceIds);
  return {
    evaluated: true,
    applied: approved,
    candidateId: candidate.id,
    commitId,
  };
}

function parseEvidenceIds(payload: Record<string, unknown>): string[] {
  if (!Array.isArray(payload.evidenceIds)) {
    throw new Error("Invalid icp-revision-evaluate payload.");
  }
  return payload.evidenceIds.filter((id): id is string => typeof id === "string");
}
