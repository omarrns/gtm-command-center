/**
 * GET /api/cron/watchlist
 *
 * Daily cron that processes watchlist alerts for all users with active monitors.
 * Auth: CRON_SECRET bearer token (fail-closed if missing).
 * Vercel cron schedule: 0 11 * * * UTC (1 hour after pipeline).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { processWatchlistAlerts } from "@/lib/pipeline/watchlist";

export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const svc = createSupabaseServiceClient();

  // Find all users that have watchlist entries with monitors
  const { data: entries, error } = await svc
    .from("watchlist")
    .select("user_id")
    .not("webset_id", "is", null);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Deduplicate user IDs
  const userIds = [...new Set((entries ?? []).map((e) => e.user_id))];

  if (!userIds.length) {
    return Response.json({
      ok: true,
      users: 0,
      newAlerts: 0,
      message: "No users with active monitors",
    });
  }

  let totalAlerts = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const result = await processWatchlistAlerts(svc, userId);
      totalAlerts += result.newAlerts;
    } catch (err) {
      errors.push(
        `User ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return Response.json({
    ok: errors.length === 0,
    users: userIds.length,
    newAlerts: totalAlerts,
    errors: errors.length > 0 ? errors : undefined,
  });
}
