import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { scoreOpportunity } from "@/lib/pipeline/scoring";

export async function runFullAnalysisJob(job: JobRow, svc: SupabaseClient) {
  const { company_name, role_title, job_description, analysis_id } =
    job.payload as {
      company_name: string;
      role_title?: string;
      job_description: string;
      analysis_id: string;
    };

  const { analysisResult } = await scoreOpportunity(
    company_name,
    role_title ?? "(infer from JD)",
    job_description,
    job.user_id,
    svc,
  );

  await svc
    .from("analyses")
    .update({ status: "complete", result: analysisResult })
    .eq("id", analysis_id)
    .eq("user_id", job.user_id);

  return analysisResult;
}
