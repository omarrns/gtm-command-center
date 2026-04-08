import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Load user's memory context for skill execution.
 *
 * Reads memory_documents rows populated by onboarding (user_profile,
 * user_positioning, etc.) or seeded from legacy CLAUDE.md / memory/*.md files.
 *
 * Accepts an optional SupabaseClient for use in workers/pipeline where the
 * cookie-scoped server client is not available. When omitted, falls back to
 * the server client (for Server Components / Actions).
 */
export interface MemoryContext {
  displayName: string;
  profile: string;
  positioning: string;
  dealbreakers: string;
  outreachStyle: string;
  all: Array<{ document_key: string; title: string; content: string }>;
}

export async function loadMemoryContext(
  userId: string,
  client?: SupabaseClient,
): Promise<MemoryContext> {
  const supabase = client ?? (await createSupabaseServerClient());

  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase
      .from("memory_documents")
      .select("document_key, title, content")
      .eq("user_id", userId),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (error) throw error;

  const byKey = (key: string) =>
    data?.find((d) => d.document_key === key)?.content ?? "";

  return {
    displayName: profile?.display_name ?? "",
    profile:
      // Prefer onboarding-created user_profile; fall back to legacy personal
      // profile (user_omar_profile). CLAUDE.md is the project context doc and
      // should NOT be used as a personal profile substitute.
      byKey("user_profile") || byKey("user_omar_profile"),
    positioning: byKey("user_positioning"),
    dealbreakers: byKey("user_dealbreakers"),
    outreachStyle:
      byKey("feedback_outreach_style") ||
      byKey("feedback_outreach_performance"),
    all: data ?? [],
  };
}

export function formatMemoryForPrompt(ctx: MemoryContext, keys?: string[]) {
  const docs = keys
    ? ctx.all.filter((d) => keys.includes(d.document_key))
    : ctx.all;
  return docs
    .map((d) => `## ${d.title} (${d.document_key})\n\n${d.content}`)
    .join("\n\n---\n\n");
}
