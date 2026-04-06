import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Trail · GTM Command Center" };

export default async function TrailPage() {
  const [user, supabase] = await Promise.all([
    requireUser(),
    createSupabaseServerClient(),
  ]);

  // Load TRAIL document and coaching sessions in parallel
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
      <div className="mb-8">
        <h2 className="text-xl font-semibold">Trail</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Career journal built from coaching sessions. Each session auto-appends
          a dated entry.
        </p>
      </div>

      {!hasTrail && !hasSessions ? (
        <div className="surface-muted flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)] mb-2">
            No trail entries yet.
          </p>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Complete your first coaching session to create the first entry.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Raw TRAIL document */}
          {hasTrail && (
            <div className="surface p-6">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
                {trailDoc.content}
              </pre>
            </div>
          )}

          {/* Session timeline */}
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
                        <span className="text-[11px] text-[var(--color-text-subtle)]">
                          {new Date(s.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {s.trail_entry && (
                        <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--color-text-muted)] leading-relaxed">
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
