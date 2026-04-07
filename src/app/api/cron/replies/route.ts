import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getGmailClient, checkReplies } from "@/lib/integrations/gmail";
import { advanceStage } from "@/lib/pipeline/opportunities";

export const maxDuration = 120;

export async function GET(request: Request) {
  // Fail-closed auth
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Server misconfigured", { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
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
    console.error("Failed to fetch sent opportunities:", fetchError.message);
    return Response.json(
      { ok: false, error: fetchError.message },
      { status: 500 },
    );
  }

  if (!sentOpps || sentOpps.length === 0) {
    return Response.json({ ok: true, checked: 0, replied: 0 });
  }

  // Group by user_id so we create one Gmail client per user
  const byUser = new Map<string, typeof sentOpps>();
  for (const opp of sentOpps) {
    const list = byUser.get(opp.user_id) ?? [];
    list.push(opp);
    byUser.set(opp.user_id, list);
  }

  let totalChecked = 0;
  let totalReplied = 0;

  for (const [userId, opps] of byUser) {
    try {
      const gmail = await getGmailClient(userId);
      const threadIds = opps
        .map((o) => o.gmail_thread_id)
        .filter((id): id is string => id !== null);

      const statuses = await checkReplies(gmail, threadIds);

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
            if (advanced) totalReplied++;
          }
        }
      }

      totalChecked += threadIds.length;
    } catch (err) {
      // Don't let one user's failure block others
      console.error(`Reply check failed for user ${userId}:`, err);
    }
  }

  return Response.json({
    ok: true,
    checked: totalChecked,
    replied: totalReplied,
  });
}
