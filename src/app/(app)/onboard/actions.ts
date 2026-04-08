"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeScoringProfile } from "@/lib/pipeline/scoring-profile";

interface ActionResult {
  ok: boolean;
  error?: string;
}

// ── Step 1: About You ──

interface ProfileData {
  positioning: string;
  careerHighlights: string;
  proofPoints: string;
  technicalTools: string;
}

export async function saveProfileAction(
  data: ProfileData,
): Promise<ActionResult> {
  const user = await requireUser();

  // Validate
  if (!data.positioning.trim()) {
    return { ok: false, error: "Positioning statement is required" };
  }
  if (!data.careerHighlights.trim()) {
    return { ok: false, error: "Career highlights are required" };
  }
  if (!data.proofPoints.trim()) {
    return { ok: false, error: "Top proof points are required" };
  }

  const profileContent = [
    `## Positioning\n\n${data.positioning.trim()}`,
    `## Career Highlights\n\n${data.careerHighlights.trim()}`,
    `## Top Proof Points\n\n${data.proofPoints.trim()}`,
    data.technicalTools.trim()
      ? `## Technical Tools\n\n${data.technicalTools.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const positioningContent = [
    `## Positioning Statement\n\n${data.positioning.trim()}`,
    `## What Makes Me Distinct\n\n${data.proofPoints.trim()}`,
  ].join("\n\n---\n\n");

  try {
    const svc = createSupabaseServiceClient();

    const { error } = await svc.from("memory_documents").upsert(
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

    if (error) return { ok: false, error: error.message };

    // Non-critical: derive scoring profile from updated data
    try {
      await normalizeScoringProfile(svc, user.id);
    } catch {
      /* best-effort */
    }

    revalidatePath("/onboard");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save profile";
    return { ok: false, error: msg };
  }
}

// ── Step 2: Search Preferences ──

interface SearchConfigData {
  searchQueries: string[];
  searchLocations: string[];
  scoreThreshold: number;
  dailySendCap: number;
}

export async function saveSearchConfigAction(
  data: SearchConfigData,
): Promise<ActionResult> {
  const user = await requireUser();

  // Validate — same rules as Settings updateConfigAction
  if (
    !Number.isInteger(data.scoreThreshold) ||
    data.scoreThreshold < 0 ||
    data.scoreThreshold > 100
  ) {
    return {
      ok: false,
      error: "Score threshold must be an integer between 0 and 100",
    };
  }
  if (
    !Number.isInteger(data.dailySendCap) ||
    data.dailySendCap < 0 ||
    data.dailySendCap > 50
  ) {
    return {
      ok: false,
      error: "Daily send cap must be an integer between 0 and 50",
    };
  }
  if (!Array.isArray(data.searchQueries) || data.searchQueries.length > 10) {
    return {
      ok: false,
      error: "Search queries must be an array of up to 10 items",
    };
  }
  if (data.searchQueries.length === 0) {
    return { ok: false, error: "At least one search query is required" };
  }
  for (const q of data.searchQueries) {
    const trimmed = typeof q === "string" ? q.trim() : "";
    if (!trimmed || trimmed.length > 100) {
      return {
        ok: false,
        error: "Each search query must be 1-100 characters",
      };
    }
  }
  if (
    !Array.isArray(data.searchLocations) ||
    data.searchLocations.length > 10
  ) {
    return {
      ok: false,
      error: "Search locations must be an array of up to 10 items",
    };
  }
  if (data.searchLocations.length === 0) {
    return { ok: false, error: "At least one search location is required" };
  }
  for (const loc of data.searchLocations) {
    const trimmed = typeof loc === "string" ? loc.trim() : "";
    if (!trimmed || trimmed.length > 100) {
      return {
        ok: false,
        error: "Each search location must be 1-100 characters",
      };
    }
  }

  try {
    const svc = createSupabaseServiceClient();

    const { error } = await svc.from("pipeline_config").upsert(
      {
        user_id: user.id,
        score_threshold: data.scoreThreshold,
        search_queries: data.searchQueries.map((q) => q.trim()),
        search_locations: data.searchLocations.map((l) => l.trim()),
        daily_send_cap: data.dailySendCap,
      },
      { onConflict: "user_id" },
    );

    if (error) return { ok: false, error: error.message };

    // Non-critical: derive scoring profile from updated search config
    try {
      await normalizeScoringProfile(svc, user.id);
    } catch {
      /* best-effort */
    }

    revalidatePath("/onboard");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save config";
    return { ok: false, error: msg };
  }
}

// ── Step 3: Outreach & Preferences ──

interface OutreachData {
  greenFlags: string;
  redFlags: string;
  outreachTone: "casual" | "direct" | "formal";
  whatsWorked: string;
  whatToAvoid: string;
}

export async function saveOutreachAction(
  data: OutreachData,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!data.greenFlags.trim() && !data.redFlags.trim()) {
    return {
      ok: false,
      error: "At least one of green flags or red flags is required",
    };
  }

  const toneLabels = { casual: "Casual", direct: "Direct", formal: "Formal" };
  if (!toneLabels[data.outreachTone]) {
    return { ok: false, error: "Invalid outreach tone" };
  }

  const dealbreakersContent = [
    data.greenFlags.trim() ? `## Green Flags\n\n${data.greenFlags.trim()}` : "",
    data.redFlags.trim() ? `## Red Flags\n\n${data.redFlags.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const outreachContent = [
    `## Outreach Tone\n\n${toneLabels[data.outreachTone]} — ${data.outreachTone === "casual" ? "conversational, internet-native, fewer bullets" : data.outreachTone === "direct" ? "straight to the point, no fluff" : "professional, structured, polished"}`,
    data.whatsWorked.trim()
      ? `## What's Worked\n\n${data.whatsWorked.trim()}`
      : "",
    data.whatToAvoid.trim()
      ? `## What to Avoid\n\n${data.whatToAvoid.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  try {
    const svc = createSupabaseServiceClient();

    const { error } = await svc.from("memory_documents").upsert(
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

    if (error) return { ok: false, error: error.message };

    // Non-critical: derive scoring profile from updated dealbreakers/outreach
    try {
      await normalizeScoringProfile(svc, user.id);
    } catch {
      /* best-effort */
    }

    revalidatePath("/onboard");
    return { ok: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to save outreach prefs";
    return { ok: false, error: msg };
  }
}
