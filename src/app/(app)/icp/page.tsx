import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isOnboardingComplete } from "@/lib/pipeline/onboarding";
import { getTemplate, toClientTemplate } from "@/lib/onboarding/templates";
import { claimOrphanedArtifacts } from "@/lib/onboarding/artifacts/reassign";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import { OnboardRouter } from "../onboard/_components/onboard-router";
import { IcpDashboard } from "../_components/icp-dashboard";

export default async function IcpPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const searchParams = await props.searchParams;

  const isRefresh = searchParams.mode === "refresh";

  const onboarding = await isOnboardingComplete(svc, user.id, "gtm");

  // Already onboarded and not a refresh → show the dashboard.
  if (onboarding.complete && !isRefresh) {
    return (
      <IcpDashboard
        userId={user.id}
        initialView={viewFrom(searchParams.view)}
      />
    );
  }

  const { data: interviewData } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", user.id)
    .eq("template_id", "icp_definition")
    .in("status", ["in_progress", "extracting", "review", "story_review"])
    .maybeSingle();

  const activeInterview =
    (interviewData as OnboardingInterviewRow | null) ?? null;

  if (activeInterview) {
    await claimOrphanedArtifacts(svc, user.id, activeInterview.id);
  }

  const clientTemplate = toClientTemplate(getTemplate("icp_definition"));

  return (
    <OnboardRouter
      interview={activeInterview}
      clientTemplate={clientTemplate}
      templateId="icp_definition"
      isRefresh={isRefresh}
      gmailConnected={false}
      completedSteps={[]}
      initialStep={null}
      existingProfile={null}
      existingPositioning={null}
      existingConfig={null}
      existingDealbreakers={null}
      existingOutreach={null}
    />
  );
}

function viewFrom(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "rubric" || raw === "narrative" || raw === "changes") {
    return raw;
  }
  return "chat";
}
