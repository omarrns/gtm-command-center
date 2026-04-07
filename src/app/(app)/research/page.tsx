import Link from "next/link";
import { Plus } from "lucide-react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Research · GTM Command Center" };

export default async function ResearchPage() {
  const [user, supabase] = await Promise.all([
    requireUser(),
    createSupabaseServerClient(),
  ]);
  const { data: reports } = await supabase
    .from("research_reports")
    .select("id, company_name, role_title, research_type, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <PageHeader
        title="Research"
        description="Exa-backed people and company research with source-aware profiles."
      >
        <Link
          href="/research/new"
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <Plus size={14} /> New Research
        </Link>
      </PageHeader>

      {!reports?.length ? (
        <EmptyState message="Start your first research run to build a source-aware profile.">
          <Link href="/research/new" className="btn-primary text-xs">
            Start Research
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <ListItem
              key={r.id}
              href={`/research/reports/${r.id}`}
              title={`${r.company_name} — ${r.role_title}`}
              subtitle={
                <>
                  <span className="badge">{r.research_type}</span>{" "}
                  {formatRelativeTime(r.created_at)}
                </>
              }
              meta={
                <span
                  className={`badge ${
                    r.status === "complete"
                      ? "badge-success"
                      : r.status === "failed"
                        ? "badge-danger"
                        : r.status === "running"
                          ? "badge-accent"
                          : ""
                  }`}
                >
                  {r.status}
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
