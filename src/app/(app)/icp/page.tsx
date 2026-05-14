import { redirect } from "next/navigation";
import { appendSearchParams, type SearchParamsInput } from "../_redirects";

export default async function IcpRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  redirect(appendSearchParams("/gtm/icp", await searchParams));
}
