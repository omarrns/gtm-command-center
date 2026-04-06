import { notFound } from "next/navigation";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { AnalysisDetail } from "./analysis-detail";

export const metadata = { title: "Analysis Detail · GTM Command Center" };

type Props = { params: Promise<{ id: string }> };

export default async function AnalysisDetailPage({ params }: Props) {
  const [{ id }, user, supabase] = await Promise.all([
    params,
    requireUser(),
    createSupabaseServerClient(),
  ]);

  const { data: analysis } = await supabase
    .from("analyses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!analysis) notFound();

  return <AnalysisDetail analysis={analysis} />;
}
