import { redirect } from "next/navigation";

export default async function VideoIcpDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/gtm/video-icp/${id}`);
}
