import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createLogger } from "@/lib/logger";
import { ICP_REVISION_CONSOLIDATE_JOB } from "@/lib/icp-agent/constants";
import { insertIcpAgentJob } from "@/lib/icp-agent/session-store";

export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createSupabaseServiceClient();
  const runId = crypto.randomUUID();
  const log = createLogger({ runId, scope: "cron.icp-revisions" });

  const { data: users, error } = await svc
    .from("profiles")
    .select("user_id")
    .eq("user_type", "gtm")
    .eq("is_enabled", true);

  if (error) {
    log.error("profile lookup failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let enqueued = 0;
  for (const user of users ?? []) {
    await insertIcpAgentJob(svc, {
      userId: user.user_id as string,
      type: ICP_REVISION_CONSOLIDATE_JOB,
      payload: { runId },
    });
    enqueued += 1;
  }

  log.info("cron complete", { enqueued });
  return NextResponse.json({ ok: true, enqueued });
}
