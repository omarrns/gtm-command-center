import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ResearchReportRow } from "@/lib/supabase/types";
import { ResearchDetail } from "./research-detail";

export const metadata = { title: "Research Report · Searchcraft" };

type Props = { params: Promise<{ id: string }> };

export default async function ResearchReportPage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const svc = createSupabaseServiceClient();

  const { data: report } = await svc
    .from("research_reports")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!report) notFound();

  return <ResearchDetail report={report as unknown as ResearchReportRow} />;
}
