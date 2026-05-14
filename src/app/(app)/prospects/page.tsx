import { redirect } from "next/navigation";
import { appendSearchParams, type SearchParamsInput } from "../_redirects";

export default async function ProspectsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  redirect(appendSearchParams("/gtm/prospects", await searchParams));
}
