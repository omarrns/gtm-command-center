import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getGmailClient, checkReplies } from "@/lib/integrations/gmail";
import { advanceStage } from "@/lib/pipeline/opportunities";
import { createLogger, newRunId } from "@/lib/logger";

export const maxDuration = 120;

export async function GET(request: Request) {
  const runId = newRunId();
  const log = createLogger({ runId, scope: "cron.replies" });

  // Fail-closed auth
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

  // Find all sent opportunities with a gmail_thread_id
  const { data: sentOpps, error: fetchError } = await svc
    .from("opportunities")
    .select("id, user_id, gmail_thread_id")
    .eq("stage", "sent")
    .not("gmail_thread_id", "is", null);

  if (fetchError) {
    log.error("failed to fetch sent opportunities", fetchError);
    return Response.json(
      { ok: false, error: fetchError.message },
      { status: 500 },
    );
  }

  if (!sentOpps || sentOpps.length === 0) {
    log.info("no sent opportunities");
    return Response.json({ ok: true, runId, checked: 0, replied: 0 });
  }

  // Group by user_id so we create one Gmail client per user
  const byUser = new Map<string, typeof sentOpps>();
  for (const opp of sentOpps) {
    const list = byUser.get(opp.user_id) ?? [];
    list.push(opp);
    byUser.set(opp.user_id, list);
  }

  log.info("checking replies", {
    users: byUser.size,
    threads: sentOpps.length,
  });

  let totalChecked = 0;
  let totalReplied = 0;

  for (const [userId, opps] of byUser) {
    const userLog = log.child({ userId });
    try {
      const gmail = await getGmailClient(userId);
      const threadIds = opps
        .map((o) => o.gmail_thread_id)
        .filter((id): id is string => id !== null);

      const statuses = await checkReplies(gmail, threadIds);

      let userReplied = 0;
      for (const status of statuses) {
        if (status.hasReply) {
          const opp = opps.find((o) => o.gmail_thread_id === status.threadId);
          if (opp) {
            const advanced = await advanceStage(
              svc,
              opp.id,
              userId,
              "sent",
              "replied",
            );
            if (advanced) {
              userReplied++;
              totalReplied++;
              userLog.info("opportunity advanced to replied", {
                opportunityId: opp.id,
                threadId: status.threadId,
              });
            }
          }
        }
      }

      totalChecked += threadIds.length;
      userLog.info("user check complete", {
        threads: threadIds.length,
        replied: userReplied,
      });
    } catch (err) {
      // Don't let one user's failure block others
      userLog.error("reply check failed", err);
    }
  }

  log.info("cron complete", { checked: totalChecked, replied: totalReplied });

  return Response.json({
    ok: true,
    runId,
    checked: totalChecked,
    replied: totalReplied,
  });
}
