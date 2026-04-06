import Link from "next/link";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";

export const metadata = { title: "Memory · GTM Command Center" };

export default async function MemoryPage() {
  const [user, supabase] = await Promise.all([
    requireUser(),
    createSupabaseServerClient(),
  ]);
  const { data: docs } = await supabase
    .from("memory_documents")
    .select("id, document_key, title, origin, updated_at")
    .eq("user_id", user.id)
    .order("title", { ascending: true });

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold">Memory</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Imported from .claude/CLAUDE.md and memory files. Edit documents
          in-browser and changes persist.
        </p>
      </div>

      {!docs?.length ? (
        <div className="surface-muted py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            No memory documents imported yet. Run{" "}
            <code className="font-mono text-xs">npm run import:memory</code> to
            seed from your workspace.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={`/memory/${d.document_key}`}
              className="surface flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface-muted)] transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{d.title}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {d.document_key}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="badge">{d.origin}</span>
                <span className="text-[11px] text-[var(--color-text-subtle)]">
                  {formatRelativeTime(d.updated_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
