import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { insertIcpAgentJob } from "@/lib/icp-agent/session-store";
import { ICP_SESSION_DISTILL_JOB } from "@/lib/icp-agent/constants";

export async function POST(
  _req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await props.params;
  const svc = createSupabaseServiceClient();

  const { data: session, error: readError } = await svc
    .from("icp_chat_sessions")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (readError || !session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  if (session.status === "complete") {
    return Response.json({ ok: true, alreadyComplete: true });
  }

  if (session.status === "completed" || session.status === "distilling") {
    return Response.json({ ok: true, alreadyQueued: true });
  }

  const { error } = await svc
    .from("icp_chat_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { jobId } = await insertIcpAgentJob(svc, {
    userId: user.id,
    type: ICP_SESSION_DISTILL_JOB,
    payload: { sessionId: id },
  });

  return Response.json({ ok: true, jobId });
}
