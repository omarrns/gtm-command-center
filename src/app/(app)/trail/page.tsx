import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Trail · GTM Command Center" };

export default async function TrailPage() {
  const [user, supabase] = await Promise.all([
    requireUser(),
    createSupabaseServerClient(),
  ]);

  const [{ data: trailDoc }, { data: sessions }] = await Promise.all([
    supabase
      .from("memory_documents")
      .select("content, updated_at")
      .eq("user_id", user.id)
      .eq("document_key", "TRAIL")
      .single(),
    supabase
      .from("coaching_sessions")
      .select("id, trail_entry, summary, created_at")
      .eq("user_id", user.id)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const hasTrail = !!trailDoc?.content;
  const hasSessions = !!sessions?.length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Trail"
        description="Career journal built from coaching sessions. Each session auto-appends a dated entry."
      />

      {!hasTrail && !hasSessions ? (
        <EmptyState
          message="No trail entries yet."
          hint="Complete your first coaching session to create the first entry."
        />
      ) : (
        <div className="space-y-6">
          {hasTrail && (
            <div className="surface p-6">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)] max-w-prose">
                {trailDoc.content}
              </pre>
            </div>
          )}

          {hasSessions && (
            <div>
              <h3 className="text-sm font-semibold mb-4">Session History</h3>
              <div className="space-y-3">
                {sessions.map((s) => {
                  const summary = s.summary as Record<string, unknown> | null;
                  return (
                    <div key={s.id} className="surface px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">
                          {(summary?.session_title as string) ?? "Session"}
                        </div>
                        <span className="text-xs text-[var(--color-text-subtle)]">
                          {new Date(s.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {s.trail_entry && (
                        <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--color-text-muted)] leading-relaxed max-w-prose">
                          {s.trail_entry}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
