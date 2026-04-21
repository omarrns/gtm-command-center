import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isOnboardingComplete } from "@/lib/pipeline/onboarding";
import {
  getDefaultTemplate,
  toClientTemplate,
} from "@/lib/onboarding/templates";
import { OnboardRouter } from "./_components/onboard-router";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

export default async function OnboardPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const searchParams = await props.searchParams;

  // Already onboarded — go to Today unless:
  //   ?mode=refresh (Profile Refresh from Settings)
  //   ?step=4 (Gmail OAuth callback returning to the wizard)
  const isRefresh = searchParams.mode === "refresh";
  const isGmailReturn = searchParams.step === "4";

  // Load the user's persona + onboarding state together. user_type is the
  // app-wide persona discriminator (null pre-confirm, 'job_seeker'|'gtm'
  // post-confirm). See SPEC-3 §Proposed architecture.
  const [{ data: profileRow }, onboarding] = await Promise.all([
    svc
      .from("profiles")
      .select("user_type")
      .eq("user_id", user.id)
      .maybeSingle(),
    isOnboardingComplete(svc, user.id),
  ]);

  // SPEC-3 Phase 2.c backfill safety net. Phase 2.a's migration wrote
  // user_type='job_seeker' for every user with a pipeline_config row.
  // Any confirmed user whose user_type is still NULL (e.g., confirmed
  // after the migration ran but before this code shipped, or an edge
  // data state the migration didn't anticipate) gets the write here on
  // their next /onboard visit. This is the ONLY site outside
  // performConfirm that writes user_type — guarded by the
  // isOnboardingComplete(job_seeker) gate so we never mis-classify.
  if (
    onboarding.complete &&
    !profileRow?.user_type &&
    !isRefresh &&
    !isGmailReturn
  ) {
    await svc
      .from("profiles")
      .update({ user_type: "job_seeker" })
      .eq("user_id", user.id);
  }

  if (onboarding.complete && !isRefresh && !isGmailReturn) {
    redirect("/");
  }

  // Fetch existing partial data for pre-fill + active interview
  const [
    profileRes,
    positioningRes,
    configRes,
    dealbreakersRes,
    outreachRes,
    gmailRes,
    interviewRes,
  ] = await Promise.all([
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", user.id)
      .eq("document_key", "user_profile")
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", user.id)
      .eq("document_key", "user_positioning")
      .maybeSingle(),
    svc
      .from("pipeline_config")
      .select(
        "score_threshold, daily_send_cap, search_queries, search_locations",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", user.id)
      .eq("document_key", "user_dealbreakers")
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", user.id)
      .eq("document_key", "feedback_outreach_style")
      .maybeSingle(),
    svc
      .from("gmail_credentials")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle(),
    svc
      .from("onboarding_interviews")
      .select("*")
      .eq("user_id", user.id)
      .eq("template_id", "job_search")
      .in("status", ["in_progress", "extracting", "review"])
      .maybeSingle(),
  ]);

  // Parse ?step=N for deep-linking
  const stepParam =
    typeof searchParams.step === "string"
      ? parseInt(searchParams.step, 10)
      : null;
  const initialStep =
    stepParam && stepParam >= 1 && stepParam <= 4 ? stepParam : null;

  const activeInterview =
    (interviewRes.data as OnboardingInterviewRow | null) ?? null;

  const clientTemplate = toClientTemplate(getDefaultTemplate());

  return (
    <OnboardRouter
      interview={activeInterview}
      clientTemplate={clientTemplate}
      isRefresh={isRefresh}
      gmailConnected={!!gmailRes.data}
      completedSteps={onboarding.completedSteps}
      initialStep={initialStep}
      existingProfile={profileRes.data?.content ?? null}
      existingPositioning={positioningRes.data?.content ?? null}
      existingConfig={
        configRes.data
          ? {
              scoreThreshold: configRes.data.score_threshold as number,
              dailySendCap: configRes.data.daily_send_cap as number,
              searchQueries: configRes.data.search_queries as string[],
              searchLocations: configRes.data.search_locations as string[],
            }
          : null
      }
      existingDealbreakers={dealbreakersRes.data?.content ?? null}
      existingOutreach={outreachRes.data?.content ?? null}
    />
  );
}
