import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

type EventStatus = "started" | "succeeded" | "failed" | "skipped";

interface IcpAgentEventInput {
  userId: string;
  jobId?: string | null;
  stage: string;
  status: EventStatus;
  message?: string | null;
  sessionId?: string | null;
  insightId?: string | null;
  evidenceIds?: string[];
  candidateId?: string | null;
  commitId?: string | null;
  model?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  error?: string | null;
}

export async function recordIcpAgentEvent(
  svc: SupabaseClient,
  input: IcpAgentEventInput,
): Promise<void> {
  const { error } = await svc.from("icp_agent_events").insert({
    user_id: input.userId,
    job_id: input.jobId ?? null,
    stage: input.stage,
    status: input.status,
    message: input.message ?? null,
    session_id: input.sessionId ?? null,
    insight_id: input.insightId ?? null,
    evidence_ids: input.evidenceIds ?? [],
    candidate_id: input.candidateId ?? null,
    commit_id: input.commitId ?? null,
    model: input.model ?? null,
    duration_ms: input.durationMs ?? null,
    metadata: input.metadata ?? {},
    error: input.error ?? null,
  });

  if (error) {
    createLogger({ scope: "icp.agent.events" }).warn(
      "icp_agent_event insert failed",
      { error: error.message, stage: input.stage, status: input.status },
    );
  }
}

export function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
