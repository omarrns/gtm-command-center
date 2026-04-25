/**
 * Watchlist Management Module
 *
 * Manages company watchlist entries with Exa Webset + Monitor tracking.
 * - addToWatchlist: insert row + create webset + create monitor (separate API call)
 * - removeFromWatchlist: ownership check + delete webset + delete row
 * - processWatchlistAlerts: fetch webset items, classify, insert alerts
 * - repairMonitors: create monitors for entries missing webset_id
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WatchlistRow, WatchlistAlertType } from "@/lib/supabase/types";
import { WEBSETS_BASE } from "@/lib/ai/exa";
import { createLogger } from "@/lib/logger";

const log = createLogger({ scope: "watchlist" });

// ---------------------------------------------------------------------------
// Return type for addToWatchlist — distinguishes new, duplicate, and error
// ---------------------------------------------------------------------------

export type AddWatchlistResult =
  | { status: "created"; row: WatchlistRow }
  | { status: "duplicate" }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// addToWatchlist
// ---------------------------------------------------------------------------

/**
 * Insert a watchlist row (idempotent via ON CONFLICT DO NOTHING) and create
 * an Exa Webset + Monitor for daily signal tracking. If the entry already
 * exists but has no monitor, repairs it by creating one.
 *
 * Returns a typed result so callers can distinguish new/duplicate/error.
 */
export async function addToWatchlist(
  svc: SupabaseClient,
  userId: string,
  companyName: string,
  source: "auto" | "manual",
): Promise<AddWatchlistResult> {
  // Upsert with ON CONFLICT DO NOTHING — returns null on duplicate
  const { data: row, error } = await svc
    .from("watchlist")
    .upsert(
      { user_id: userId, company_name: companyName, source },
      { onConflict: "user_id,company_name", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();

  if (error) {
    log.error("watchlist upsert failed", error, { userId, companyName });
    return { status: "error", message: error.message };
  }

  if (!row) {
    // Duplicate — but check if the existing row needs monitor repair
    await repairMonitorIfNeeded(svc, userId, companyName);
    return { status: "duplicate" };
  }

  // New row — create Exa Webset + Monitor
  await attachMonitor(svc, userId, row.id, companyName);

  // Re-read to get latest webset_id
  const { data: updated } = await svc
    .from("watchlist")
    .select("*")
    .eq("id", row.id)
    .single();

  return { status: "created", row: (updated ?? row) as WatchlistRow };
}

// ---------------------------------------------------------------------------
// removeFromWatchlist
// ---------------------------------------------------------------------------

/**
 * Verify ownership, delete any associated Exa Webset (best-effort, logged),
 * then delete the watchlist row. CASCADE handles alert cleanup.
 */
export async function removeFromWatchlist(
  svc: SupabaseClient,
  userId: string,
  watchlistId: string,
): Promise<boolean> {
  const { data: row, error: fetchError } = await svc
    .from("watchlist")
    .select("id, user_id, webset_id")
    .eq("id", watchlistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError || !row) return false;

  // Best-effort webset cleanup (logged)
  const apiKey = process.env.EXA_API_KEY;
  if (apiKey && row.webset_id) {
    await deleteWebsetQuietly(apiKey, row.webset_id);
  }

  const { error: deleteError } = await svc
    .from("watchlist")
    .delete()
    .eq("id", watchlistId)
    .eq("user_id", userId);

  if (deleteError) {
    log.error("watchlist delete failed", deleteError, { userId, watchlistId });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// processWatchlistAlerts
// ---------------------------------------------------------------------------

export interface ProcessAlertsResult {
  processed: number;
  newAlerts: number;
  errors: number;
}

/**
 * For all watchlist entries with a webset_id, fetch Exa Webset items,
 * classify each as an alert type, and insert new alert rows (deduped
 * by source_item_id). Only counts genuinely new inserts, and only
 * updates last_alert_at when new alerts were inserted.
 */
export async function processWatchlistAlerts(
  svc: SupabaseClient,
  userId: string,
): Promise<ProcessAlertsResult> {
  const { data: entries, error } = await svc
    .from("watchlist")
    .select("id, webset_id")
    .eq("user_id", userId)
    .not("webset_id", "is", null);

  if (error) throw error;

  const result: ProcessAlertsResult = {
    processed: 0,
    newAlerts: 0,
    errors: 0,
  };

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey || !entries?.length) return result;

  for (const entry of entries) {
    try {
      result.processed++;
      const items = await fetchWebsetItems(apiKey, entry.webset_id!);

      let newForEntry = 0;
      for (const item of items) {
        const alertType = classifyAlertType(item.title ?? "", item.text ?? "");

        // Check if this alert already exists before inserting
        const { data: existing } = await svc
          .from("watchlist_alerts")
          .select("id")
          .eq("watchlist_id", entry.id)
          .eq("source_item_id", item.id)
          .maybeSingle();

        if (existing) continue; // Already tracked — skip

        const { error: insertError } = await svc
          .from("watchlist_alerts")
          .insert({
            watchlist_id: entry.id,
            alert_type: alertType,
            title: (item.title ?? "Untitled").slice(0, 500),
            summary: item.text?.slice(0, 1000) ?? null,
            source_url: item.url ?? null,
            source_item_id: item.id,
          });

        if (!insertError) {
          newForEntry++;
        }
      }

      // Only update last_alert_at when genuinely new alerts were inserted
      if (newForEntry > 0) {
        await svc
          .from("watchlist")
          .update({ last_alert_at: new Date().toISOString() })
          .eq("id", entry.id)
          .eq("user_id", userId);
      }

      result.newAlerts += newForEntry;
    } catch (err) {
      result.errors++;
      log.error("alert processing failed", err, {
        userId,
        watchlistId: entry.id,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Alert type classification
// ---------------------------------------------------------------------------

const ALERT_PATTERNS: Array<{
  type: WatchlistAlertType;
  patterns: RegExp;
}> = [
  {
    type: "funding",
    patterns:
      /\b(funding|raised|series\s[a-e]|investment|venture|round|valuation|capital)\b/i,
  },
  {
    type: "leadership_change",
    patterns:
      /\b(CEO|CTO|VP|appoint|joins\sas|new\s(?:chief|head|director)|leadership)\b/i,
  },
  {
    type: "job_posting",
    patterns:
      /\b(job\sposting|careers|open\srole|we(?:'re|\sare)\shipping|now\shipping)\b/i,
  },
  {
    type: "hire",
    patterns:
      /\b(hiring|hire|recruited|talent|engineer(?:ing)?|team\sgrowth)\b/i,
  },
  {
    type: "launch",
    patterns:
      /\b(launch|released|announces|new\sproduct|shipped|ga\b|general\savailability)\b/i,
  },
  {
    type: "press",
    patterns:
      /\b(press|featured|article|coverage|media|interview|podcast|blog)\b/i,
  },
];

function classifyAlertType(title: string, text: string): WatchlistAlertType {
  const combined = `${title} ${text}`;
  for (const { type, patterns } of ALERT_PATTERNS) {
    if (patterns.test(combined)) return type;
  }
  return "press";
}

// ---------------------------------------------------------------------------
// Monitor repair — for entries that were created without a webset_id
// ---------------------------------------------------------------------------

/**
 * If an existing watchlist row has no webset_id (e.g. EXA_API_KEY was missing
 * or monitor creation failed on first add), create the monitor now.
 */
async function repairMonitorIfNeeded(
  svc: SupabaseClient,
  userId: string,
  companyName: string,
): Promise<void> {
  const { data: existing } = await svc
    .from("watchlist")
    .select("id, webset_id")
    .eq("user_id", userId)
    .eq("company_name", companyName)
    .maybeSingle();

  if (!existing || existing.webset_id) return; // Already has monitor or not found

  await attachMonitor(svc, userId, existing.id, companyName);
}

/**
 * Create an Exa Webset, then create a Monitor on it for daily refresh.
 * Updates the watchlist row with the webset_id. Best-effort — logs failures
 * but doesn't throw.
 */
async function attachMonitor(
  svc: SupabaseClient,
  userId: string,
  watchlistId: string,
  companyName: string,
): Promise<void> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return;

  try {
    // Step 1: Create the webset (search only, no monitoring field)
    const websetId = await createWebset(apiKey, companyName);
    if (!websetId) return;

    // Step 2: Create a monitor on the webset via POST /monitors
    await createMonitor(apiKey, websetId, companyName);

    // Step 3: Persist the webset_id
    await svc
      .from("watchlist")
      .update({ webset_id: websetId })
      .eq("id", watchlistId)
      .eq("user_id", userId);
  } catch (err) {
    log.error("failed to attach monitor", err, {
      userId,
      watchlistId,
      companyName,
    });
  }
}

// ---------------------------------------------------------------------------
// Exa Websets API helpers
// ---------------------------------------------------------------------------

interface WebsetItem {
  id: string;
  title: string | null;
  url: string | null;
  text: string | null;
}

/**
 * Create a plain webset with an initial search. Returns the webset ID.
 */
async function createWebset(
  apiKey: string,
  companyName: string,
): Promise<string | null> {
  const query = `"${companyName}" funding OR hiring OR launch OR press OR leadership`;

  const res = await fetch(`${WEBSETS_BASE}/websets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      search: { query, count: 10 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Exa create webset failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Create a monitor on a webset for daily refresh.
 * POST /websets/v0/monitors per Exa docs:
 * https://exa.ai/docs/websets/api/monitors/create-a-monitor
 *
 * Required fields: websetId, cadence (cron + timezone), behavior (type + config).
 */
async function createMonitor(
  apiKey: string,
  websetId: string,
  companyName: string,
): Promise<void> {
  const query = `"${companyName}" funding OR hiring OR launch OR press OR leadership`;

  const res = await fetch(`${WEBSETS_BASE}/monitors`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      websetId,
      cadence: {
        cron: "0 9 * * *", // Daily at 9 AM UTC
        timezone: "Etc/UTC",
      },
      behavior: {
        type: "search",
        config: {
          query,
          count: 10,
          behavior: "append",
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Exa create monitor failed: ${res.status} ${body}`);
  }
}

/**
 * Fetch all items from an Exa Webset.
 */
async function fetchWebsetItems(
  apiKey: string,
  websetId: string,
): Promise<WebsetItem[]> {
  const res = await fetch(
    `${WEBSETS_BASE}/websets/${websetId}/items?limit=100`,
    {
      headers: { "x-api-key": apiKey },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Exa read webset items failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { data: WebsetItem[] };
  return data.data ?? [];
}

/**
 * Best-effort webset deletion. Logs failures for diagnosing Exa
 * webset/monitor leaks, but never throws.
 */
async function deleteWebsetQuietly(
  apiKey: string,
  websetId: string,
): Promise<void> {
  try {
    const res = await fetch(`${WEBSETS_BASE}/websets/${websetId}`, {
      method: "DELETE",
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) {
      log.warn("exa webset cleanup failed", {
        websetId,
        status: res.status,
        body: await res.text(),
      });
    }
  } catch (err) {
    log.warn("exa webset cleanup error", {
      websetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
