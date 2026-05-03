import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { MODELS } from "@/lib/ai/models";
import { runGenerateObject } from "@/lib/ai/calls";
import { buildEvidenceRouterPrompt } from "@/lib/icp-agent/prompts";
import { routedEvidenceSchema } from "@/lib/icp-agent/schemas";
import {
  elapsedMs,
  errorMessage,
  recordIcpAgentEvent,
} from "@/lib/icp-agent/events";
import { insertIcpAgentJob } from "@/lib/icp-agent/session-store";
import { ICP_REVISION_EVALUATE_JOB } from "@/lib/icp-agent/constants";

export async function runIcpEvidenceRouteJob(
  job: JobRow,
  svc: SupabaseClient,
) {
  const startedAt = Date.now();
  const insightId = parseInsightId(job.payload);
  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-evidence-route",
    status: "started",
    message: "Routing distilled ICP insights into evidence categories.",
    insightId,
    model: MODELS.icpEvidenceRouter,
  });

  try {
    const result = await routeEvidence(job, svc, insightId, startedAt);
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-evidence-route",
      status: "succeeded",
      message: "ICP evidence routing completed.",
      sessionId: result.sessionId,
      insightId,
      evidenceIds: result.evidenceIds,
      model: MODELS.icpEvidenceRouter,
      durationMs: elapsedMs(startedAt),
      metadata: {
        evidenceCount: result.evidenceCount,
        evaluationIds: result.evaluationIds,
      },
    });
    return result;
  } catch (error) {
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-evidence-route",
      status: "failed",
      message: "ICP evidence routing failed.",
      insightId,
      model: MODELS.icpEvidenceRouter,
      durationMs: elapsedMs(startedAt),
      error: errorMessage(error),
    });
    throw error;
  }
}

async function routeEvidence(
  job: JobRow,
  svc: SupabaseClient,
  insightId: string,
  startedAt: number,
) {
  const { data: insight, error } = await svc
    .from("icp_session_insights")
    .select("id, user_id, session_id, insights")
    .eq("id", insightId)
    .eq("user_id", job.user_id)
    .single();

  if (error || !insight) {
    throw new Error(`ICP insight not found: ${insightId}`);
  }

  const routed = await runGenerateObject({
    model: MODELS.icpEvidenceRouter,
    system: "Classify ICP chat insights into durable evidence items.",
    prompt: buildEvidenceRouterPrompt(insight.insights),
    schema: routedEvidenceSchema,
    maxOutputTokens: 3072,
    scope: {
      userId: job.user_id,
      scopeTable: "icp_session_insights",
      scopeId: insightId,
      callPurpose: "icp-evidence-route",
    },
  });

  const rows = routed.items.map((item) => ({
    user_id: job.user_id,
    session_id: insight.session_id,
    insight_id: insightId,
    evidence_type: item.evidenceType,
    title: item.title,
    detail: item.detail,
    target: item.target,
    confidence: item.confidence,
    metadata: { shouldEvaluateRevision: item.shouldEvaluateRevision },
  }));

  const { data: inserted, error: insertError } = await svc
    .from("icp_evidence_items")
    .insert(rows)
    .select("id, evidence_type, confidence, metadata");

  if (insertError) {
    throw new Error(`ICP evidence insert failed: ${insertError.message}`);
  }

  await writeImmediateMemory(svc, job.user_id, rows);

  const evaluationIds = (inserted ?? [])
    .filter((item) => {
      const metadata = item.metadata as Record<string, unknown>;
      return (
        item.evidence_type === "icp_calibration" &&
        Number(item.confidence) >= 0.8 &&
        metadata.shouldEvaluateRevision === true
      );
    })
    .map((item) => item.id as string);

  if (evaluationIds.length > 0) {
    await insertIcpAgentJob(svc, {
      userId: job.user_id,
      type: ICP_REVISION_EVALUATE_JOB,
      payload: { evidenceIds: evaluationIds },
    });
  }

  const evidenceIds = (inserted ?? []).map((item) => item.id as string);
  return {
    insightId,
    sessionId: insight.session_id as string,
    evidenceCount: rows.length,
    evidenceIds,
    evaluationIds,
    durationMs: elapsedMs(startedAt),
  };
}

async function writeImmediateMemory(
  svc: SupabaseClient,
  userId: string,
  rows: Array<{ evidence_type: string; title: string; detail: string; confidence: number }>,
) {
  const durable = rows.filter((row) => {
    return (
      row.confidence >= 0.8 &&
      (row.evidence_type === "messaging_lesson" ||
        row.evidence_type === "account_memory")
    );
  });
  if (durable.length === 0) return;

  const content = durable
    .map((row) => `- **${row.title}** (${row.evidence_type}): ${row.detail}`)
    .join("\n");
  const { data: existing } = await svc
    .from("memory_documents")
    .select("content")
    .eq("user_id", userId)
    .eq("document_key", "icp_agent_lessons")
    .maybeSingle();
  const nextContent = [existing?.content, content].filter(Boolean).join("\n");

  await svc.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "icp_agent_lessons",
      title: "ICP Agent Lessons",
      origin: "system",
      content: trimLessonDoc(nextContent),
      metadata: { generated_from: "icp_chat" },
    },
    { onConflict: "user_id,document_key" },
  );
}

function trimLessonDoc(content: string): string {
  const lines = content.split("\n").filter(Boolean);
  return lines.slice(-50).join("\n");
}

function parseInsightId(payload: Record<string, unknown>): string {
  if (typeof payload.insightId !== "string") {
    throw new Error("Invalid icp-evidence-route payload.");
  }
  return payload.insightId;
}
