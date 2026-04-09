"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeScoringProfile } from "@/lib/pipeline/scoring-profile";
import { runExtractionFromTranscript } from "@/lib/onboarding/extraction";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { UIMessage } from "ai";

interface ActionResult {
  ok: boolean;
  error?: string;
}

// ── Check Interview State (lightweight refetch for extraction trigger) ──

export async function checkInterviewStateAction(
  interviewId: string,
): Promise<{ readyForExtraction: boolean; topicsCovered: string[] }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data } = await svc
    .from("onboarding_interviews")
    .select("ready_for_extraction, topics_covered")
    .eq("id", interviewId)
    .eq("user_id", user.id)
    .single();

  return {
    readyForExtraction: data?.ready_for_extraction ?? false,
    topicsCovered: (data?.topics_covered as string[]) ?? [],
  };
}

// ── Get or Create Interview ──

export async function getOrCreateInterviewAction(
  isRefresh: boolean,
): Promise<
  { ok: true; interview: OnboardingInterviewRow } | { ok: false; error: string }
> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  console.log(
    "[getOrCreateInterview] userId:",
    user.id,
    "isRefresh:",
    isRefresh,
  );

  // Check for existing active interview
  const { data: existing, error: existingErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["in_progress", "extracting", "review"])
    .maybeSingle();

  if (existingErr) {
    console.error("[getOrCreateInterview] query error:", existingErr.message);
  }

  if (existing) {
    console.log(
      "[getOrCreateInterview] found existing interview:",
      existing.id,
      "status:",
      existing.status,
    );
    return { ok: true, interview: existing as OnboardingInterviewRow };
  }

  console.log("[getOrCreateInterview] no existing interview, creating new one");

  // Create new interview
  const { data: created, error } = await svc
    .from("onboarding_interviews")
    .insert({
      user_id: user.id,
      is_refresh: isRefresh,
      status: "in_progress",
      messages: [],
      topics_covered: [],
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      "[getOrCreateInterview] insert error:",
      error.message,
      error.details,
      error.code,
    );
    return { ok: false, error: error.message };
  }

  console.log("[getOrCreateInterview] created interview:", created?.id);
  return { ok: true, interview: created as OnboardingInterviewRow };
}

// ── Extract and Review ──

export async function extractAndReviewAction(
  interviewId: string,
): Promise<
  { ok: true; interview: OnboardingInterviewRow } | { ok: false; error: string }
> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Load interview and verify ownership
  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== user.id) {
    return { ok: false, error: "Interview not found" };
  }

  // If already in review/extracting, just return current state (idempotent)
  if (interview.status === "review" || interview.status === "extracting") {
    return { ok: true, interview: interview as OnboardingInterviewRow };
  }

  if (interview.status !== "in_progress") {
    return {
      ok: false,
      error: `Cannot extract from status: ${interview.status}`,
    };
  }

  // Atomic compare-and-set: only claim extraction if still in_progress.
  // Two concurrent callers: only one update matches, the loser gets 0 rows.
  const { data: claimed } = await svc
    .from("onboarding_interviews")
    .update({ status: "extracting", updated_at: new Date().toISOString() })
    .eq("id", interviewId)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Another caller already claimed extraction — refetch and return
    const { data: refetched } = await svc
      .from("onboarding_interviews")
      .select("*")
      .eq("id", interviewId)
      .single();
    if (refetched) {
      return { ok: true, interview: refetched as OnboardingInterviewRow };
    }
    return { ok: false, error: "Extraction already in progress" };
  }

  try {
    const messages = interview.messages as UIMessage[];
    const extraction = await runExtractionFromTranscript(messages);

    const { data: updated, error: updateErr } = await svc
      .from("onboarding_interviews")
      .update({
        status: "review",
        extracted_profile: extraction.profile,
        extracted_search: extraction.search,
        extracted_outreach: extraction.outreach,
        extracted_insights: extraction.insights,
        updated_at: new Date().toISOString(),
      })
      .eq("id", interviewId)
      .select("*")
      .single();

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    revalidatePath("/onboard");
    return { ok: true, interview: updated as OnboardingInterviewRow };
  } catch (err) {
    // Revert to in_progress on failure so user can retry
    await svc
      .from("onboarding_interviews")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", interviewId);

    const msg = err instanceof Error ? err.message : "Extraction failed";
    return { ok: false, error: msg };
  }
}

// ── Confirm Interview ──

interface ConfirmEdits {
  profile: {
    positioning: string;
    careerHighlights: string;
    proofPoints: string;
    technicalTools: string;
  };
  search: {
    searchQueries: string[];
    searchLocations: string[];
    scoreThreshold: number;
    dailySendCap: number;
  };
  outreach: {
    greenFlags: string;
    redFlags: string;
    outreachTone: "casual" | "direct" | "formal";
    whatsWorked: string;
    whatToAvoid: string;
  };
}

export async function confirmInterviewAction(
  interviewId: string,
  edits: ConfirmEdits,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Verify interview ownership and status
  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("id, user_id, status, extracted_insights")
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== user.id) {
    return { ok: false, error: "Interview not found" };
  }

  if (interview.status !== "review") {
    return { ok: false, error: "Interview is not in review" };
  }

  try {
    // Sequential idempotent writes — each is an upsert, safe to retry

    // 1. Upsert memory documents: user_profile + user_positioning
    const profileContent = [
      `## Positioning\n\n${edits.profile.positioning.trim()}`,
      `## Career Highlights\n\n${edits.profile.careerHighlights.trim()}`,
      `## Top Proof Points\n\n${edits.profile.proofPoints.trim()}`,
      edits.profile.technicalTools.trim()
        ? `## Technical Tools\n\n${edits.profile.technicalTools.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const positioningContent = [
      `## Positioning Statement\n\n${edits.profile.positioning.trim()}`,
      `## What Makes Me Distinct\n\n${edits.profile.proofPoints.trim()}`,
    ].join("\n\n---\n\n");

    const { error: profileErr } = await svc.from("memory_documents").upsert(
      [
        {
          user_id: user.id,
          document_key: "user_profile",
          title: "User Profile",
          origin: "onboarding",
          content: profileContent,
          metadata: {},
        },
        {
          user_id: user.id,
          document_key: "user_positioning",
          title: "User Positioning",
          origin: "onboarding",
          content: positioningContent,
          metadata: {},
        },
      ],
      { onConflict: "user_id,document_key" },
    );
    if (profileErr)
      throw new Error(`Profile write failed: ${profileErr.message}`);

    // 2. Upsert pipeline_config
    const { error: configErr } = await svc.from("pipeline_config").upsert(
      {
        user_id: user.id,
        score_threshold: edits.search.scoreThreshold,
        search_queries: edits.search.searchQueries,
        search_locations: edits.search.searchLocations,
        daily_send_cap: edits.search.dailySendCap,
      },
      { onConflict: "user_id" },
    );
    if (configErr) throw new Error(`Config write failed: ${configErr.message}`);

    // 3. Upsert dealbreakers + outreach style memory documents
    const toneLabels = { casual: "Casual", direct: "Direct", formal: "Formal" };
    const toneDescriptions = {
      casual: "conversational, internet-native, fewer bullets",
      direct: "straight to the point, no fluff",
      formal: "professional, structured, polished",
    };

    const dealbreakersContent = [
      edits.outreach.greenFlags.trim()
        ? `## Green Flags\n\n${edits.outreach.greenFlags.trim()}`
        : "",
      edits.outreach.redFlags.trim()
        ? `## Red Flags\n\n${edits.outreach.redFlags.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const outreachContent = [
      `## Outreach Tone\n\n${toneLabels[edits.outreach.outreachTone]} — ${toneDescriptions[edits.outreach.outreachTone]}`,
      edits.outreach.whatsWorked.trim()
        ? `## What's Worked\n\n${edits.outreach.whatsWorked.trim()}`
        : "",
      edits.outreach.whatToAvoid.trim()
        ? `## What to Avoid\n\n${edits.outreach.whatToAvoid.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const { error: outreachErr } = await svc.from("memory_documents").upsert(
      [
        {
          user_id: user.id,
          document_key: "user_dealbreakers",
          title: "User Dealbreakers",
          origin: "onboarding",
          content: dealbreakersContent,
          metadata: {},
        },
        {
          user_id: user.id,
          document_key: "feedback_outreach_style",
          title: "Outreach Style",
          origin: "onboarding",
          content: outreachContent,
          metadata: {},
        },
      ],
      { onConflict: "user_id,document_key" },
    );
    if (outreachErr)
      throw new Error(`Outreach write failed: ${outreachErr.message}`);

    // 4. Persist interview_insights as memory document
    if (interview.extracted_insights) {
      const insightsContent = formatInsightsAsMarkdown(
        interview.extracted_insights as Record<string, unknown>,
      );
      const { error: insightsErr } = await svc.from("memory_documents").upsert(
        {
          user_id: user.id,
          document_key: "interview_insights",
          title: "Interview Insights",
          origin: "onboarding",
          content: insightsContent,
          metadata: {},
        },
        { onConflict: "user_id,document_key" },
      );
      if (insightsErr)
        throw new Error(`Insights write failed: ${insightsErr.message}`);
    }

    // 5. Normalize scoring profile (single call, not triple-fired)
    await normalizeScoringProfile(svc, user.id);

    // 6. Mark interview as confirmed — only after all writes succeed
    const { error: confirmErr } = await svc
      .from("onboarding_interviews")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", interviewId);

    if (confirmErr)
      throw new Error(`Confirm status failed: ${confirmErr.message}`);

    revalidatePath("/onboard");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    // Interview stays in 'review' — user can retry
    const msg = err instanceof Error ? err.message : "Confirmation failed";
    return { ok: false, error: msg };
  }
}

// ── Abandon Interview ──

export async function abandonInterviewAction(
  interviewId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { error } = await svc
    .from("onboarding_interviews")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", interviewId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/onboard");
  return { ok: true };
}

// ── Back to Interview (from Review) ──

export async function backToInterviewAction(
  interviewId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { error } = await svc
    .from("onboarding_interviews")
    .update({
      status: "in_progress",
      ready_for_extraction: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/onboard");
  return { ok: true };
}

// ── Helpers ──

function formatInsightsAsMarkdown(insights: Record<string, unknown>): string {
  const sections: string[] = [];

  if (insights.career_narrative) {
    sections.push(`## Career Narrative\n\n${insights.career_narrative}`);
  }
  if (
    Array.isArray(insights.decision_drivers) &&
    insights.decision_drivers.length > 0
  ) {
    sections.push(
      `## Decision Drivers\n\n${insights.decision_drivers.map((d: unknown) => `- ${d}`).join("\n")}`,
    );
  }
  if (
    Array.isArray(insights.unstated_preferences) &&
    insights.unstated_preferences.length > 0
  ) {
    sections.push(
      `## Unstated Preferences\n\n${insights.unstated_preferences.map((p: unknown) => `- ${p}`).join("\n")}`,
    );
  }
  if (
    Array.isArray(insights.strongest_stories) &&
    insights.strongest_stories.length > 0
  ) {
    sections.push(
      `## Strongest Stories\n\n${insights.strongest_stories.map((s: unknown) => `- ${s}`).join("\n")}`,
    );
  }
  if (
    Array.isArray(insights.positioning_alternatives) &&
    insights.positioning_alternatives.length > 0
  ) {
    sections.push(
      `## Positioning Alternatives\n\n${insights.positioning_alternatives.map((a: unknown) => `- ${a}`).join("\n")}`,
    );
  }
  if (insights.risk_tolerance) {
    sections.push(`## Risk Tolerance\n\n${insights.risk_tolerance}`);
  }
  if (insights.communication_style_notes) {
    sections.push(
      `## Communication Style\n\n${insights.communication_style_notes}`,
    );
  }

  return sections.join("\n\n---\n\n");
}
