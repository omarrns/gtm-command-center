import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/page-header";
import {
  WatchlistClient,
  type WatchlistEntry,
} from "./_components/watchlist-client";
import type { WatchlistRow, WatchlistAlertRow } from "@/lib/supabase/types";

export default async function WatchlistPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Fetch watchlist entries
  const { data: rows } = await svc
    .from("watchlist")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const watchlistRows = (rows ?? []) as WatchlistRow[];

  // Fetch all alerts for this user's watchlist entries in one query
  const watchlistIds = watchlistRows.map((r) => r.id);
  let alertRows: WatchlistAlertRow[] = [];

  if (watchlistIds.length > 0) {
    const { data: alerts } = await svc
      .from("watchlist_alerts")
      .select("*")
      .in("watchlist_id", watchlistIds)
      .order("detected_at", { ascending: false });

    alertRows = (alerts ?? []) as WatchlistAlertRow[];
  }

  // Group alerts by watchlist_id
  const alertsByWatchlist = new Map<string, WatchlistAlertRow[]>();
  for (const alert of alertRows) {
    const existing = alertsByWatchlist.get(alert.watchlist_id) ?? [];
    existing.push(alert);
    alertsByWatchlist.set(alert.watchlist_id, existing);
  }

  // Build entries with nested alerts
  const entries: WatchlistEntry[] = watchlistRows.map((row) => ({
    ...row,
    alerts: alertsByWatchlist.get(row.id) ?? [],
  }));

  return (
    <>
      <PageHeader
        title="Watchlist"
        description="Companies you're monitoring for signals"
      />
      <WatchlistClient entries={entries} />
    </>
  );
}
