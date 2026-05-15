/**
 * GET /api/cron/watchlist
 *
 * Daily cron that processes watchlist alerts for all users with active monitors.
 * Auth: CRON_SECRET bearer token (fail-closed if missing).
 * Vercel cron schedule: 0 11 * * * UTC (1 hour after pipeline).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { processWatchlistAlerts } from "@/lib/pipeline/watchlist";
import { createLogger, newRunId } from "@/lib/logger";

export const maxDuration = 120;

export async function GET(request: Request) {
  const runId = newRunId();
  const log = createLogger({ runId, scope: "cron.watchlist" });

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log.error("CRON_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    log.warn("unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  const svc = createSupabaseServiceClient();

  // Find all users that have watchlist entries with monitors
  const { data: entries, error } = await svc
    .from("watchlist")
    .select("user_id")
    .not("webset_id", "is", null);

  if (error) {
    log.error("failed to load watchlist entries", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Deduplicate user IDs
  const monitoredUserIds = [...new Set((entries ?? []).map((e) => e.user_id))];

  if (!monitoredUserIds.length) {
    log.info("no users with active monitors");
    return Response.json({
      ok: true,
      runId,
      users: 0,
      newAlerts: 0,
      message: "No users with active monitors",
    });
  }

  const { data: enabledProfiles, error: profileError } = await svc
    .from("profiles")
    .select("user_id")
    .in("user_id", monitoredUserIds)
    .eq("is_enabled", true);

  if (profileError) {
    log.error("failed to load enabled profiles", profileError);
    return Response.json(
      { ok: false, error: profileError.message },
      { status: 500 },
    );
  }

  const userIds = (enabledProfiles ?? []).map((profile) => profile.user_id);
  const skippedDisabled = monitoredUserIds.length - userIds.length;

  if (!userIds.length) {
    log.info("no enabled users with active monitors", { skippedDisabled });
    return Response.json({
      ok: true,
      runId,
      users: 0,
      newAlerts: 0,
      message: "No enabled users with active monitors",
    });
  }

  log.info("processing watchlists", { users: userIds.length });

  let totalAlerts = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    const userLog = log.child({ userId });
    try {
      const result = await processWatchlistAlerts(svc, userId);
      totalAlerts += result.newAlerts;
      userLog.info("watchlist processed", { newAlerts: result.newAlerts });
    } catch (err) {
      userLog.error("watchlist processing failed", err);
      errors.push(
        `User ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  log.info("cron complete", {
    users: userIds.length,
    skippedDisabled,
    newAlerts: totalAlerts,
    errors: errors.length,
  });

  return Response.json({
    ok: errors.length === 0,
    runId,
    users: userIds.length,
    newAlerts: totalAlerts,
    errors: errors.length > 0 ? errors : undefined,
  });
}
