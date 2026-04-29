import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { UserType } from "@/lib/supabase/types";
import { ActivationClient } from "./_components/activation-client";

interface ActivatePageProps {
  searchParams?: Promise<{ limit?: string; source?: string }>;
}

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const params = await searchParams;
  const activationSource = params?.source === "existing" ? "existing" : "live";
  const activationLimit = params?.limit ?? null;

  const [{ data: config }, { data: profile }] = await Promise.all([
    svc
      .from("pipeline_config")
      .select("activation_completed_at, score_threshold")
      .eq("user_id", user.id)
      .maybeSingle(),
    svc
      .from("profiles")
      .select("user_type")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Already activated — go to Today
  if (config?.activation_completed_at && activationSource !== "existing") {
    redirect("/");
  }

  // No config means onboarding isn't done
  if (!config) {
    redirect("/onboard");
  }

  const scoreThreshold = config.score_threshold ?? 70;
  const userType = (profile?.user_type ?? "job_seeker") as UserType;

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
      userType={userType}
      activationSource={activationSource}
      activationLimit={activationLimit}
    />
  );
}
