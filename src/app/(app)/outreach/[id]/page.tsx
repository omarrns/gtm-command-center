import { redirect } from "next/navigation";

export default async function OutreachDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/career/outreach/${id}`);
}
