import Link from "next/link";
import { Plus } from "lucide-react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-semibold">Research</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Exa-backed people and company research with source-aware profiles.
          </p>
        </div>
        <Link
          href="/research/new"
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <Plus size={13} /> New Research
        </Link>
      </div>

      {!reports?.length ? (
        <div className="surface-muted flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            No research runs yet.
          </p>
          <Link href="/research/new" className="btn-primary text-xs">
            Start Research
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/research/reports/${r.id}`}
              className="surface flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface-muted)] transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  {r.company_name} — {r.role_title}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  <span className="badge">{r.research_type}</span>{" "}
                  {formatRelativeTime(r.created_at)}
                </div>
              </div>
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
