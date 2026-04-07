import Link from "next/link";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { EmptyState } from "@/components/empty-state";

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
      <PageHeader
        title="Memory"
        description="Imported from .claude/CLAUDE.md and memory files. Edit documents in-browser and changes persist."
      />

      {!docs?.length ? (
        <EmptyState
          message="No memory documents imported yet."
          hint='Run "npm run import:memory" to seed from your workspace.'
        />
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <ListItem
              key={d.id}
              href={`/memory/${d.document_key}`}
              title={d.title}
              subtitle={d.document_key}
              meta={
                <>
                  <span className="badge">{d.origin}</span>
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    {formatRelativeTime(d.updated_at)}
                  </span>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
