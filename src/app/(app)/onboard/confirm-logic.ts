import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScoringProfile } from "@/lib/pipeline/scoring-profile";

export interface ConfirmEdits {
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

export interface ConfirmResult {
  ok: boolean;
  error?: string;
}

// Test seam: the persistence body of confirmInterviewAction without the
// server-action wrappers (requireUser, revalidatePath). Scripts can exercise
// this directly with a service-role client and a known userId.
export async function performConfirm(
  svc: SupabaseClient,
  userId: string,
  interviewId: string,
  edits: ConfirmEdits,
): Promise<ConfirmResult> {
  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select("id, user_id, status, extracted_insights")
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== userId) {
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
          user_id: userId,
          document_key: "user_profile",
          title: "User Profile",
          origin: "onboarding",
          content: profileContent,
          metadata: {},
        },
        {
          user_id: userId,
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
        user_id: userId,
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
          user_id: userId,
          document_key: "user_dealbreakers",
          title: "User Dealbreakers",
          origin: "onboarding",
          content: dealbreakersContent,
          metadata: {},
        },
        {
          user_id: userId,
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
          user_id: userId,
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
    await normalizeScoringProfile(svc, userId);

    // 6. Mark interview as confirmed — only after all writes succeed
    const { error: confirmErr } = await svc
      .from("onboarding_interviews")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", interviewId);

    if (confirmErr)
      throw new Error(`Confirm status failed: ${confirmErr.message}`);

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Confirmation failed";
    return { ok: false, error: msg };
  }
}

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
