import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { runClaudeJson } from "@/lib/ai/anthropic";
import {
  CAREER_COACH_SYSTEM,
  buildCareerCoachPrompt,
} from "@/lib/skills/prompts/career-coach";

export async function runCareerCoachJob(job: JobRow, svc: SupabaseClient) {
  const { session_id, transcript } = job.payload as {
    session_id: string;
    transcript: string;
  };

  // 1. Load memory context
  const { data: memDocs } = await svc
    .from("memory_documents")
    .select("document_key, title, content")
    .eq("user_id", job.user_id);

  const memory = (memDocs ?? [])
    .map((d) => `## ${d.title}\n\n${d.content}`)
    .join("\n\n---\n\n");

  // 2. Load recent trail entries
  const { data: recentSessions } = await svc
    .from("coaching_sessions")
    .select("trail_entry, created_at")
    .eq("user_id", job.user_id)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(5);

  const recentTrail = (recentSessions ?? [])
    .map((s) => s.trail_entry ?? "")
    .filter(Boolean)
    .join("\n\n");

  // 3. Synthesize
  const result = await runClaudeJson({
    system: CAREER_COACH_SYSTEM,
    prompt: buildCareerCoachPrompt({ transcript, memory, recentTrail }),
    maxTokens: 4096,
  });

  const typedResult = result as Record<string, unknown>;

  // 4. Update coaching session
  await svc
    .from("coaching_sessions")
    .update({
      status: "complete",
      summary: typedResult,
      trail_entry: (typedResult.trail_entry as string) ?? null,
    })
    .eq("id", session_id)
    .eq("user_id", job.user_id);

  // 5. Create TRAIL document if first entry
  if (typedResult.trail_entry) {
    const { data: existingTrail } = await svc
      .from("memory_documents")
      .select("id, content")
      .eq("user_id", job.user_id)
      .eq("document_key", "TRAIL")
      .single();

    if (existingTrail) {
      await svc
        .from("memory_documents")
        .update({
          content: existingTrail.content + "\n\n" + typedResult.trail_entry,
        })
        .eq("id", existingTrail.id);
    } else {
      await svc.from("memory_documents").insert({
        user_id: job.user_id,
        document_key: "TRAIL",
        title: "TRAIL.md — Career Journal",
        origin: "generated",
        content: `# TRAIL\n\n${typedResult.trail_entry}`,
        metadata: { auto_created: true },
      });
    }
  }

  return typedResult;
}
