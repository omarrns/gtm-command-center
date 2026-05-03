import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { ICP_REVISION_EVALUATE_JOB } from "@/lib/icp-agent/constants";
import {
  elapsedMs,
  errorMessage,
  recordIcpAgentEvent,
} from "@/lib/icp-agent/events";
import { insertIcpAgentJob } from "@/lib/icp-agent/session-store";

export async function runIcpRevisionConsolidateJob(
  job: JobRow,
  svc: SupabaseClient,
) {
  const startedAt = Date.now();
  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-revision-consolidate",
    status: "started",
    message: "Checking accumulated ICP calibration evidence.",
  });

  try {
    const result = await consolidateEvidence(job, svc, startedAt);
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-consolidate",
      status: result.enqueued ? "succeeded" : "skipped",
      message: result.enqueued
        ? "Queued ICP revision evaluation from accumulated evidence."
        : "Not enough accumulated evidence for ICP revision evaluation.",
      evidenceIds: result.evidenceIds,
      durationMs: elapsedMs(startedAt),
      metadata: result,
    });
    return result;
  } catch (error) {
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-revision-consolidate",
      status: "failed",
      message: "ICP revision consolidation failed.",
      durationMs: elapsedMs(startedAt),
      error: errorMessage(error),
    });
    throw error;
  }
}

async function consolidateEvidence(
  job: JobRow,
  svc: SupabaseClient,
  startedAt: number,
) {
  const { data, error } = await svc
    .from("icp_evidence_items")
    .select("id")
    .eq("user_id", job.user_id)
    .eq("evidence_type", "icp_calibration")
    .is("processed_at", null)
    .gte("confidence", 0.7)
    .order("created_at", { ascending: true })
    .limit(12);

  if (error) throw new Error(`ICP consolidation lookup failed: ${error.message}`);
  const evidenceIds = (data ?? []).map((row) => row.id as string);
  if (evidenceIds.length < 3) {
    return {
      enqueued: false,
      evidenceCount: evidenceIds.length,
      evidenceIds,
      durationMs: elapsedMs(startedAt),
    };
  }

  const { jobId } = await insertIcpAgentJob(svc, {
    userId: job.user_id,
    type: ICP_REVISION_EVALUATE_JOB,
    payload: { evidenceIds },
  });

  return {
    enqueued: true,
    evidenceCount: evidenceIds.length,
    evidenceIds,
    jobId,
    durationMs: elapsedMs(startedAt),
  };
}
