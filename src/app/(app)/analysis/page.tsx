import Link from "next/link";
import { Plus } from "lucide-react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";

export const metadata = { title: "Analysis · GTM Command Center" };

export default async function AnalysisPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-semibold">Analyses</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            JD rubrics, company fit assessments, and full opportunity analyses.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/analysis/job"
            className="btn-ghost border border-[var(--color-border)] flex items-center gap-1.5 text-xs"
          >
            <Plus size={13} /> JD Rubric
          </Link>
          <Link
            href="/analysis/company"
            className="btn-ghost border border-[var(--color-border)] flex items-center gap-1.5 text-xs"
          >
            <Plus size={13} /> Company
          </Link>
        </div>
      </div>

      {!analyses?.length ? (
        <div className="surface-muted flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            No analyses yet. Start by pasting a JD or entering a company name.
          </p>
          <div className="flex gap-2">
            <Link href="/analysis/job" className="btn-primary text-xs">
              New JD Rubric
            </Link>
            <Link
              href="/analysis/company"
              className="btn-ghost border border-[var(--color-border)] text-xs"
            >
              Company Analysis
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {analyses.map((a) => {
            const r = a.result as Record<string, unknown> | null;
            const jdFitSub = r?.jd_fit as Record<string, unknown> | undefined;
            const score = r?.total_score ?? jdFitSub?.total_score ?? null;
            const verdict = r?.verdict ?? jdFitSub?.verdict ?? null;
            return (
              <Link
                key={a.id}
                href={`/analysis/${a.id}`}
                className="surface flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface-muted)] transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {a.company_name ?? "Unknown"}{" "}
                    {a.role_title ? `— ${a.role_title}` : ""}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2">
                    <span className="badge">{a.skill_slug}</span>
                    <span>{formatRelativeTime(a.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
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
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
