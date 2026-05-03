import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS } from "@/lib/ai/models";
import type { RevisionPatch } from "@/lib/icp-agent/schemas";
import {
  applyNarrativePatches,
  applyRubricPatches,
} from "@/lib/icp-agent/patches";
import { formatIcpNarrativeAsMarkdown } from "@/lib/onboarding/templates/icp-definition/narrative-formatter";
import type { IcpNarrativeArc } from "@/lib/onboarding/icp-narrative-schema";

type RevisionTarget = "rubric" | "narrative";

export async function loadEvidence(
  svc: SupabaseClient,
  userId: string,
  evidenceIds: string[],
) {
  const { data, error } = await svc
    .from("icp_evidence_items")
    .select("id, title, detail, target, confidence, metadata")
    .eq("user_id", userId)
    .in("id", evidenceIds);
  if (error) throw new Error(`ICP evidence lookup failed: ${error.message}`);
  return data ?? [];
}

export async function loadBeforeSnapshot(
  svc: SupabaseClient,
  userId: string,
  target: RevisionTarget,
): Promise<{ snapshot: Record<string, unknown>; content?: string | null }> {
  if (target === "rubric") {
    const { data, error } = await svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.icp_rubric) throw new Error("ICP rubric not found.");
    return { snapshot: data.icp_rubric as Record<string, unknown> };
  }

  const { data } = await svc
    .from("memory_documents")
    .select("content")
    .eq("user_id", userId)
    .eq("document_key", "icp_narrative_arc")
    .maybeSingle();
  return { snapshot: { content: data?.content ?? "" }, content: data?.content };
}

export function applyRevisionPatches(input: {
  target: RevisionTarget;
  before: { snapshot: Record<string, unknown>; content?: string | null };
  patches: RevisionPatch[];
}) {
  return input.target === "rubric"
    ? applyRubricPatches(input.before.snapshot, input.patches)
    : applyNarrativePatches(input.before.content ?? null, input.patches);
}

export async function applyLiveUpdate(
  svc: SupabaseClient,
  userId: string,
  target: RevisionTarget,
  after: Record<string, unknown>,
) {
  if (target === "rubric") {
    const { error } = await svc
      .from("user_scoring_profiles")
      .update({ icp_rubric: after })
      .eq("user_id", userId);
    if (error) throw new Error(`ICP rubric update failed: ${error.message}`);
    return;
  }

  const content =
    typeof after.content === "string"
      ? after.content
      : formatIcpNarrativeAsMarkdown(after.arc as IcpNarrativeArc);
  const { error } = await svc.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "icp_narrative_arc",
      title: "ICP Narrative Arc",
      origin: "system",
      content,
      metadata: { updated_from: "icp_agent" },
    },
    { onConflict: "user_id,document_key" },
  );
  if (error) throw new Error(`ICP narrative update failed: ${error.message}`);
}

export async function insertCandidate(
  svc: SupabaseClient,
  userId: string,
  input: {
    status: "rejected" | "applied";
    target: RevisionTarget;
    title: string;
    reason: string;
    proposedPatch: Record<string, unknown>;
    judgeResult: Record<string, unknown>;
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot?: Record<string, unknown> | null;
    evidenceIds: string[];
    confidence: number;
  },
): Promise<{ id: string }> {
  const { data, error } = await svc
    .from("icp_revision_candidates")
    .insert({
      user_id: userId,
      status: input.status,
      target: input.target,
      title: input.title,
      reason: input.reason,
      proposed_patch: input.proposedPatch,
      judge_result: input.judgeResult,
      before_snapshot: input.beforeSnapshot,
      after_snapshot: input.afterSnapshot ?? null,
      evidence_ids: input.evidenceIds,
      proposer_model: MODELS.icpRevisionCritic,
      judge_model: MODELS.icpRevisionJudge,
      confidence: input.confidence,
      applied_at: input.status === "applied" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(`ICP candidate insert failed: ${error?.message}`);
  }
  return { id: data.id as string };
}

export async function insertCommit(
  svc: SupabaseClient,
  userId: string,
  input: {
    candidateId: string;
    target: RevisionTarget;
    title: string;
    reason: string;
    changedPaths: string[];
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot: Record<string, unknown>;
    diff: Record<string, unknown>;
    evidenceIds: string[];
    confidence: number;
  },
): Promise<string> {
  const { data, error } = await svc
    .from("icp_revision_commits")
    .insert({
      user_id: userId,
      candidate_id: input.candidateId,
      target: input.target,
      title: input.title,
      reason: input.reason,
      changed_paths: input.changedPaths,
      before_snapshot: input.beforeSnapshot,
      after_snapshot: input.afterSnapshot,
      diff: input.diff,
      evidence_ids: input.evidenceIds,
      proposer_model: MODELS.icpRevisionCritic,
      judge_model: MODELS.icpRevisionJudge,
      confidence: input.confidence,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(`ICP commit insert failed: ${error?.message}`);
  }
  return data.id as string;
}

export async function markEvidenceProcessed(
  svc: SupabaseClient,
  userId: string,
  evidenceIds: string[],
) {
  await svc
    .from("icp_evidence_items")
    .update({ processed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", evidenceIds);
}
