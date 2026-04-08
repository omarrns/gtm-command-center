"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { revokeToken } from "@/lib/integrations/gmail";
import { normalizeScoringProfile } from "@/lib/pipeline/scoring-profile";

interface ConfigUpdates {
  scoreThreshold?: number;
  searchQueries?: string[];
  searchLocations?: string[];
  dailySendCap?: number;
}

export async function updateConfigAction(
  updates: ConfigUpdates,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  // Validate score_threshold
  if (updates.scoreThreshold !== undefined) {
    if (
      !Number.isInteger(updates.scoreThreshold) ||
      updates.scoreThreshold < 0 ||
      updates.scoreThreshold > 100
    ) {
      return {
        ok: false,
        error: "Score threshold must be an integer between 0 and 100",
      };
    }
  }

  // Validate daily_send_cap
  if (updates.dailySendCap !== undefined) {
    if (
      !Number.isInteger(updates.dailySendCap) ||
      updates.dailySendCap < 0 ||
      updates.dailySendCap > 50
    ) {
      return {
        ok: false,
        error: "Daily send cap must be an integer between 0 and 50",
      };
    }
  }

  // Validate search_queries
  if (updates.searchQueries !== undefined) {
    if (
      !Array.isArray(updates.searchQueries) ||
      updates.searchQueries.length > 10
    ) {
      return {
        ok: false,
        error: "Search queries must be an array of up to 10 items",
      };
    }
    for (const q of updates.searchQueries) {
      const trimmed = typeof q === "string" ? q.trim() : "";
      if (!trimmed || trimmed.length > 100) {
        return {
          ok: false,
          error: "Each search query must be 1-100 characters",
        };
      }
    }
  }

  // Validate search_locations
  if (updates.searchLocations !== undefined) {
    if (
      !Array.isArray(updates.searchLocations) ||
      updates.searchLocations.length > 10
    ) {
      return {
        ok: false,
        error: "Search locations must be an array of up to 10 items",
      };
    }
    for (const loc of updates.searchLocations) {
      const trimmed = typeof loc === "string" ? loc.trim() : "";
      if (!trimmed || trimmed.length > 100) {
        return {
          ok: false,
          error: "Each search location must be 1-100 characters",
        };
      }
    }
  }

  // Build the update payload — only include changed fields
  const payload: Record<string, number | string[]> = {};
  if (updates.scoreThreshold !== undefined)
    payload.score_threshold = updates.scoreThreshold;
  if (updates.dailySendCap !== undefined)
    payload.daily_send_cap = updates.dailySendCap;
  if (updates.searchQueries !== undefined)
    payload.search_queries = updates.searchQueries.map((q) => q.trim());
  if (updates.searchLocations !== undefined)
    payload.search_locations = updates.searchLocations.map((l) => l.trim());

  if (Object.keys(payload).length === 0) {
    return { ok: true };
  }

  try {
    const svc = createSupabaseServiceClient();
    const { data: updated, error } = await svc
      .from("pipeline_config")
      .update(payload)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!updated) {
      return {
        ok: false,
        error:
          "No pipeline config found — run the pipeline first to initialize",
      };
    }

    // Non-critical: derive scoring profile from updated config
    try {
      await normalizeScoringProfile(svc, user.id);
    } catch {
      /* best-effort */
    }

    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return { ok: false, error: msg };
  }
}

// ── Scoring Profile Weights ──

const WEIGHT_KEYS = [
  "weight_role_fit",
  "weight_seniority",
  "weight_stage",
  "weight_domain",
  "weight_stack",
  "weight_proof_points",
  "weight_dealbreaker",
] as const;

type WeightKey = (typeof WEIGHT_KEYS)[number];

export async function updateScoringWeightsAction(
  weights: Partial<Record<WeightKey, number>>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  // Validate all provided weights are in range
  const payload: Record<string, number> = {};
  for (const [key, value] of Object.entries(weights)) {
    if (!WEIGHT_KEYS.includes(key as WeightKey)) {
      return { ok: false, error: `Invalid weight key: ${key}` };
    }
    if (typeof value !== "number" || value < 0.5 || value > 2.0) {
      return {
        ok: false,
        error: `Weight ${key} must be between 0.5 and 2.0`,
      };
    }
    // Round to 1 decimal place to match slider step
    payload[key] = Math.round(value * 10) / 10;
  }

  if (Object.keys(payload).length === 0) {
    return { ok: true };
  }

  try {
    const svc = createSupabaseServiceClient();
    const { error } = await svc
      .from("user_scoring_profiles")
      .update(payload)
      .eq("user_id", user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update weights";
    return { ok: false, error: msg };
  }
}

export async function disconnectGmailAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireUser();

  try {
    await revokeToken(user.id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Disconnect failed";
    return { ok: false, error: msg };
  }
}
