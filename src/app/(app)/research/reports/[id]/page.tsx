import { notFound } from "next/navigation";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { ResearchDetail } from "./research-detail";

export const metadata = { title: "Research Report · GTM Command Center" };

type Props = { params: Promise<{ id: string }> };

export default async function ResearchReportPage({ params }: Props) {
  const [{ id }, user, supabase] = await Promise.all([
    params,
    requireUser(),
    createSupabaseServerClient(),
  ]);

  const { data: report } = await supabase
    .from("research_reports")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!report) notFound();

  return <ResearchDetail report={report} />;
}
