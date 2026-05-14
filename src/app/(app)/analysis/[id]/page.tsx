import { redirect } from "next/navigation";

export default async function AnalysisDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/career/analysis/${id}`);
}
