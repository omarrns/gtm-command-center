"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { asJson } from "@/lib/supabase/schema";
import type { IcpRevisionCommitRow } from "@/lib/icp-agent/types";

export async function rollbackIcpRevisionAction(commitId: string) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: commit, error } = await svc
    .from("icp_revision_commits")
    .select("*")
    .eq("id", commitId)
    .eq("user_id", user.id)
    .single();

  if (error || !commit) return { ok: false, error: "Commit not found." };
  const row = commit as IcpRevisionCommitRow;

  if (row.target === "rubric") {
    const { error: updateError } = await svc
      .from("user_scoring_profiles")
      .update({ icp_rubric: asJson(row.before_snapshot) })
      .eq("user_id", user.id);
    if (updateError) return { ok: false, error: updateError.message };
  } else if (row.target === "narrative") {
    const content =
      typeof row.before_snapshot.content === "string"
        ? row.before_snapshot.content
        : "";
    const { error: updateError } = await svc.from("memory_documents").upsert(
      {
        user_id: user.id,
        document_key: "icp_narrative_arc",
        title: "ICP Narrative Arc",
        origin: "system",
        content,
        metadata: asJson({ rollback_of: row.id }),
      },
      { onConflict: "user_id,document_key" },
    );
    if (updateError) return { ok: false, error: updateError.message };
  } else {
    return { ok: false, error: "Rollback commits cannot be rolled back." };
  }

  const { error: commitError } = await svc.from("icp_revision_commits").insert({
    user_id: user.id,
    rollback_of: row.id,
    target: "rollback",
    title: `Rollback: ${row.title}`,
    reason: "Manual rollback from ICP change log.",
    changed_paths: row.changed_paths,
    before_snapshot: asJson(row.after_snapshot),
    after_snapshot: asJson(row.before_snapshot),
    diff: asJson({
      rollback_of: row.id,
      restored_paths: row.changed_paths,
    }),
    evidence_ids: row.evidence_ids,
    proposer_model: row.proposer_model,
    judge_model: row.judge_model,
    confidence: row.confidence,
  });

  if (commitError) return { ok: false, error: commitError.message };

  revalidatePath("/gtm/icp");
  revalidatePath("/gtm/icp/changes");
  return { ok: true };
}
