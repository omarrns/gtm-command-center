import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { AnalysisDetail } from "./analysis-detail";

export const metadata = { title: "Analysis Detail · GTM Command Center" };

type Props = { params: Promise<{ id: string }> };

export default async function AnalysisDetailPage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const svc = createSupabaseServiceClient();

  const { data: analysis } = await svc
    .from("analyses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!analysis) notFound();

  return <AnalysisDetail analysis={analysis} />;
}
