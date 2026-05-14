"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { addToWatchlist, removeFromWatchlist } from "@/lib/pipeline/watchlist";

// ---------------------------------------------------------------------------
// Add company to watchlist (manual)
// ---------------------------------------------------------------------------

export async function addWatchlistAction(
  companyName: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  const trimmed = companyName.trim();
  if (!trimmed) return { ok: false, error: "Company name is required" };
  if (trimmed.length > 100) {
    return { ok: false, error: "Company name must be 100 characters or fewer" };
  }

  const svc = createSupabaseServiceClient();
  const result = await addToWatchlist(svc, user.id, trimmed, "manual");

  if (result.status === "error") {
    return { ok: false, error: result.message };
  }
  if (result.status === "duplicate") {
    return { ok: false, error: "Company is already on your watchlist" };
  }

  revalidatePath("/career/watchlist");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Remove company from watchlist
// ---------------------------------------------------------------------------

export async function removeWatchlistAction(
  watchlistId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const removed = await removeFromWatchlist(svc, user.id, watchlistId);
  if (!removed) {
    return { ok: false, error: "Watchlist entry not found" };
  }

  revalidatePath("/career/watchlist");
  return { ok: true };
}
