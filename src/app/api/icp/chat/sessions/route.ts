import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { parseCreateSessionRequest } from "../_lib/validation";

export async function POST(req: Request) {
  const parsed = await parseCreateSessionRequest(req);
  if (!parsed.ok) return parsed.response;

  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const body = parsed.data;

  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.user_type !== "gtm") {
    return Response.json(
      { error: "ICP chat is only available for GTM users." },
      { status: 403 },
    );
  }

  const { data, error } = await svc
    .from("icp_chat_sessions")
    .insert({
      user_id: user.id,
      opportunity_id: body.opportunityId ?? null,
      account_name: body.accountName ?? null,
      account_domain: body.accountDomain ?? null,
      purpose: body.purpose,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return Response.json(
      { error: error?.message ?? "Failed to create ICP chat session." },
      { status: 500 },
    );
  }

  return Response.json({ sessionId: data.id });
}
