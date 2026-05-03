import type { SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";
import type { JobRow } from "@/lib/supabase/types";
import { MODELS } from "@/lib/ai/models";
import { runGenerateObject } from "@/lib/ai/calls";
import { loadIcpAgentContext } from "@/lib/icp-agent/context";
import { buildSessionDistillPrompt } from "@/lib/icp-agent/prompts";
import { sessionInsightSchema } from "@/lib/icp-agent/schemas";
import {
  elapsedMs,
  errorMessage,
  recordIcpAgentEvent,
} from "@/lib/icp-agent/events";
import {
  formatMessagesForPrompt,
  insertIcpAgentJob,
} from "@/lib/icp-agent/session-store";
import { ICP_EVIDENCE_ROUTE_JOB } from "@/lib/icp-agent/constants";

export async function runIcpSessionDistillJob(
  job: JobRow,
  svc: SupabaseClient,
) {
  const startedAt = Date.now();
  const sessionId = parseSessionId(job.payload);
  await recordIcpAgentEvent(svc, {
    userId: job.user_id,
    jobId: job.id,
    stage: "icp-session-distill",
    status: "started",
    message: "Distilling ICP chat transcript into structured insights.",
    sessionId,
    model: MODELS.icpSessionDistill,
  });

  try {
    const result = await distillSession(job, svc, sessionId, startedAt);
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-session-distill",
      status: "succeeded",
      message: "Structured ICP chat insights created.",
      sessionId,
      insightId: result.insightId,
      model: MODELS.icpSessionDistill,
      durationMs: elapsedMs(startedAt),
    });
    return result;
  } catch (error) {
    await recordIcpAgentEvent(svc, {
      userId: job.user_id,
      jobId: job.id,
      stage: "icp-session-distill",
      status: "failed",
      message: "ICP chat distillation failed.",
      sessionId,
      model: MODELS.icpSessionDistill,
      durationMs: elapsedMs(startedAt),
      error: errorMessage(error),
    });
    throw error;
  }
}

async function distillSession(
  job: JobRow,
  svc: SupabaseClient,
  sessionId: string,
  startedAt: number,
) {
  const { data: session, error: sessionError } = await svc
    .from("icp_chat_sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .eq("user_id", job.user_id)
    .single();

  if (sessionError || !session) {
    throw new Error(`ICP chat session not found: ${sessionId}`);
  }

  await svc
    .from("icp_chat_sessions")
    .update({ status: "distilling" })
    .eq("id", sessionId)
    .eq("user_id", job.user_id);

  const { data: rows, error: messagesError } = await svc
    .from("icp_chat_messages")
    .select("message")
    .eq("session_id", sessionId)
    .eq("user_id", job.user_id)
    .order("ordinal", { ascending: true });

  if (messagesError) {
    throw new Error(`ICP messages lookup failed: ${messagesError.message}`);
  }

  const messages = (rows ?? []).map((row) => row.message as UIMessage);
  const context = await loadIcpAgentContext(svc, job.user_id);
  const insights = await runGenerateObject({
    model: MODELS.icpSessionDistill,
    system: "Return structured evidence from an ICP chat session.",
    prompt: buildSessionDistillPrompt({
      context,
      transcript: formatMessagesForPrompt(messages),
    }),
    schema: sessionInsightSchema,
    maxOutputTokens: 4096,
    scope: {
      userId: job.user_id,
      scopeTable: "icp_chat_sessions",
      scopeId: sessionId,
      callPurpose: "icp-session-distill",
    },
  });

  const { data: insight, error: insightError } = await svc
    .from("icp_session_insights")
    .insert({
      session_id: sessionId,
      user_id: job.user_id,
      summary: insights.summary,
      insights,
      model: MODELS.icpSessionDistill,
    })
    .select("id")
    .single();

  if (insightError || !insight?.id) {
    throw new Error(`ICP insight insert failed: ${insightError?.message}`);
  }

  await svc
    .from("icp_chat_sessions")
    .update({ status: "complete", summary: insights.summary })
    .eq("id", sessionId)
    .eq("user_id", job.user_id);

  await insertIcpAgentJob(svc, {
    userId: job.user_id,
    type: ICP_EVIDENCE_ROUTE_JOB,
    payload: { insightId: insight.id },
  });

  return { sessionId, insightId: insight.id, durationMs: elapsedMs(startedAt) };
}

function parseSessionId(payload: Record<string, unknown>): string {
  if (typeof payload.sessionId !== "string") {
    throw new Error("Invalid icp-session-distill payload.");
  }
  return payload.sessionId;
}
