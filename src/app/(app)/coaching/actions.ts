"use server";

import { requireUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { enqueueJob } from "@/lib/jobs/enqueue";

export async function startCoachingSessionAction(formData: FormData) {
  const user = await requireUser();
  const transcript = String(formData.get("transcript") ?? "").trim();

  if (!transcript) return { error: "Session transcript is required." };

  const supabase = await createSupabaseServerClient();

  const { data: session, error: sErr } = await supabase
    .from("coaching_sessions")
    .insert({
      user_id: user.id,
      status: "running",
      transcript: { raw: transcript },
    })
    .select("id")
    .single();

  if (sErr || !session)
    return { error: sErr?.message ?? "Failed to create session." };

  const { jobId } = await enqueueJob({
    userId: user.id,
    type: "career-coach",
    payload: { session_id: session.id, transcript },
  });

  await supabase
    .from("coaching_sessions")
    .update({ job_id: jobId })
    .eq("id", session.id);

  return { sessionId: session.id, jobId };
}
