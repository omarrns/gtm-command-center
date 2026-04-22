import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isOnboardingComplete } from "@/lib/pipeline/onboarding";
import { getTemplate, toClientTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import { OnboardRouter } from "./_components/onboard-router";
import { PersonaPicker } from "./_components/persona-picker";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

// Map the app-wide persona discriminator to the template that confirms
// into it. Used in refresh flows where the user is known and we pick
// their template automatically.
const USER_TYPE_TO_TEMPLATE: Record<string, InterviewTemplateId> = {
  job_seeker: "job_search",
  gtm: "icp_definition",
};

function parseTemplateParam(
  raw: string | string[] | undefined,
): InterviewTemplateId | null {
  if (typeof raw !== "string") return null;
  if (raw === "job_search" || raw === "icp_definition") return raw;
  return null;
}

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
  const templateParam = parseTemplateParam(searchParams.template);

  // Load user_type. SPEC-3 §Proposed architecture: user_type is NULL
  // pre-confirm; 'job_seeker'|'gtm' post-confirm. Drives the picker vs.
  // template routing below.
  const { data: profileRow } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const userType = profileRow?.user_type as "job_seeker" | "gtm" | null;

  // Resolve which template to route the page to. URL param wins (explicit
  // user choice). Otherwise fall back to the confirmed persona's template
  // (refresh flow). If neither is set we render the persona picker.
  const resolvedTemplateId: InterviewTemplateId | null =
    templateParam ??
    (userType ? (USER_TYPE_TO_TEMPLATE[userType] ?? null) : null);

  // Ask the right template whether onboarding is complete. Defaults to
  // 'job_seeker' before user_type is set — matches pre-SPEC-3 behavior.
  const onboarding = await isOnboardingComplete(
    svc,
    user.id,
    userType ?? "job_seeker",
  );

  // SPEC-3 Phase 2.c backfill safety net. Phase 2.a's migration wrote
  // user_type='job_seeker' for every user with a pipeline_config row.
  // Any confirmed user whose user_type is still NULL (e.g., confirmed
  // after the migration ran but before this code shipped, or an edge
  // data state the migration didn't anticipate) gets the write here on
  // their next /onboard visit. This is the ONLY site outside
  // performConfirm that writes user_type — guarded by the
  // isOnboardingComplete(job_seeker) gate so we never mis-classify.
  if (onboarding.complete && !userType && !isRefresh && !isGmailReturn) {
    await svc
      .from("profiles")
      .update({ user_type: "job_seeker" })
      .eq("user_id", user.id);
  }

  if (onboarding.complete && !isRefresh && !isGmailReturn) {
    redirect("/");
  }

  // No template resolved + no persona set → show the picker. User clicks
  // a card, lands back on this page with ?template=X, and the resolved
  // path below takes over. No DB writes happen here; picking a persona
  // is free until confirm.
  if (!resolvedTemplateId) {
    return <PersonaPicker isRefresh={isRefresh} />;
  }

  // Fetch existing partial data for pre-fill + active interview scoped
  // to the resolved template. Dropping the old hardcoded
  // .eq("template_id", "job_search") — each persona has its own active
  // interview row thanks to the (user_id, template_id) partial unique
  // index.
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
      .eq("template_id", resolvedTemplateId)
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

  const clientTemplate = toClientTemplate(getTemplate(resolvedTemplateId));

  return (
    <OnboardRouter
      interview={activeInterview}
      clientTemplate={clientTemplate}
      templateId={resolvedTemplateId}
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
