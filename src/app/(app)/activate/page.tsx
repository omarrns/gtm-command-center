import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { UserType } from "@/lib/supabase/types";
import { appendSearchParams, type SearchParamsInput } from "../_redirects";

export default async function ActivateRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const userType = (profile?.user_type as UserType | null) ?? null;
  const href = userType === "gtm" ? "/gtm/activate" : "/career/activate";

  redirect(appendSearchParams(href, await searchParams));
}
