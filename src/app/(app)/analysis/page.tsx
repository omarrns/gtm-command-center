import Link from "next/link";
import { Plus } from "lucide-react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Analysis · GTM Command Center" };

export default async function AnalysisPage() {
  const [user, supabase] = await Promise.all([
    requireUser(),
    createSupabaseServerClient(),
  ]);
  const { data: analyses } = await supabase
    .from("analyses")
    .select(
      "id, skill_slug, company_name, role_title, status, result, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <PageHeader
        title="Analyses"
        description="JD rubrics, company fit assessments, and full opportunity analyses."
      >
        <Link
          href="/analysis/job"
          className="btn-ghost border border-[var(--color-border)] flex items-center gap-1.5 text-xs"
        >
          <Plus size={14} /> JD Rubric
        </Link>
        <Link
          href="/analysis/company"
          className="btn-ghost border border-[var(--color-border)] flex items-center gap-1.5 text-xs"
        >
          <Plus size={14} /> Company
        </Link>
      </PageHeader>

      {!analyses?.length ? (
        <EmptyState message="Paste a job description or enter a company name to get started.">
          <Link href="/analysis/job" className="btn-primary text-xs">
            New JD Rubric
          </Link>
          <Link
            href="/analysis/company"
            className="btn-ghost border border-[var(--color-border)] text-xs"
          >
            Company Analysis
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {analyses.map((a) => {
            const r = a.result as Record<string, unknown> | null;
            const jdFitSub = r?.jd_fit as Record<string, unknown> | undefined;
            const score = r?.total_score ?? jdFitSub?.total_score ?? null;
            const verdict = r?.verdict ?? jdFitSub?.verdict ?? null;
            return (
              <ListItem
                key={a.id}
                href={`/analysis/${a.id}`}
                title={`${a.company_name ?? "Unknown"} ${a.role_title ? `— ${a.role_title}` : ""}`}
                subtitle={
                  <>
                    <span className="badge">{a.skill_slug}</span>{" "}
                    {formatRelativeTime(a.created_at)}
                  </>
                }
                meta={
                  <>
                    {score !== null && (
                      <span className="text-sm font-semibold">
                        {String(score)}
                      </span>
                    )}
                    {verdict && (
                      <span
                        className={`badge ${
                          verdict === "Strong match" || verdict === "Pursue"
                            ? "badge-success"
                            : verdict === "Stretch" || verdict === "Skip"
                              ? "badge-danger"
                              : "badge-warning"
                        }`}
                      >
                        {String(verdict)}
                      </span>
                    )}
                    {a.status === "running" && (
                      <span className="badge badge-accent">Running…</span>
                    )}
                    {a.status === "failed" && (
                      <span className="badge badge-danger">Failed</span>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
