"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobRow } from "@/lib/supabase/types";
import { pokeWorker } from "./poke-worker";

/**
 * Insert a job row and return its ID. The caller should also create the
 * associated domain row (analysis, research_report, etc.) linked to job_id.
 */
export async function enqueueJob({
  userId,
  type,
  payload,
}: {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<{ jobId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({ user_id: userId, type, payload })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to enqueue job: ${error?.message ?? "no data"}`);
  }

  pokeWorker(type);

  return { jobId: data.id };
}

/**
 * Poll a job by ID. Use on the client via the useJobPoll hook.
 */
export async function getJob(jobId: string): Promise<JobRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error) return null;
  return data as JobRow;
}
