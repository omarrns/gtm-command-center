import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatRelativeTime } from "@/lib/utils";
import type { ResearchReportRow } from "@/lib/supabase/types";

export default async function ResearchPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data } = await svc
    .from("research_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const reports = (data ?? []) as unknown as ResearchReportRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research"
        description="Standalone analyst workspace for saved research reports."
      />

      {reports.length === 0 ? (
        <EmptyState
          message="No research reports yet"
          hint="Research reports created by workflows will collect here."
        />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/research/reports/${report.id}`}
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-2"
            >
              <Card className="gap-2 p-4 transition-colors hover:bg-[var(--color-surface-muted)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {report.company_name}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {report.role_title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="muted">{report.status}</Badge>
                    <span className="text-xs text-[var(--color-text-subtle)]">
                      {formatRelativeTime(report.created_at)}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
