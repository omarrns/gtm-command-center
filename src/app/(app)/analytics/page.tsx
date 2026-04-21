import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/page-header";
import { loadAnalyticsData } from "./_loaders/analytics-data";
import { AnalyticsDashboardClient } from "./_components/analytics-dashboard-client";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
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
