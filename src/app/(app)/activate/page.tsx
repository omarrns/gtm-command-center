import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ActivationClient } from "./_components/activation-client";

export default async function ActivatePage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: config } = await svc
    .from("pipeline_config")
    .select("activation_completed_at, score_threshold")
    .eq("user_id", user.id)
    .maybeSingle();

  // Already activated — go to Today
  if (config?.activation_completed_at) {
    redirect("/");
  }

  // No config means onboarding isn't done
  if (!config) {
    redirect("/onboard");
  }

  const scoreThreshold = config.score_threshold ?? 70;

  // Check Gmail connection for the prompt
  const { data: gmailCreds } = await svc
    .from("gmail_credentials")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <ActivationClient
      gmailConnected={!!gmailCreds}
      scoreThreshold={scoreThreshold}
    />
  );
}
