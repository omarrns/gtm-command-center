import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import type { UserType } from "@/lib/supabase/types";
import { loadAnalyticsData } from "./_loaders/analytics-data";
import { AnalyticsDashboardClient } from "./_components/analytics-dashboard-client";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // SPEC-3 Phase 6.c: GTM persona has no opportunities pipeline in v1.
  // The sidebar already hides /analytics for GTM, but if a user lands
  // here directly we still want a meaningful empty state instead of an
  // empty dashboard chart.
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const userType = (profile?.user_type as UserType | null) ?? null;

  if (userType === "gtm") {
    return (
      <>
        <PageHeader
          title="Analytics"
          description="Trends across all discovered opportunities"
        />
        <EmptyState
          message="Automated discovery is coming"
          hint="Your ICP rubric is the v1 asset — refresh it from the home screen."
        />
      </>
    );
  }

  const rows = await loadAnalyticsData(svc, user.id);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Trends across all discovered opportunities"
      />
      <AnalyticsDashboardClient rows={rows} />
    </>
  );
}
