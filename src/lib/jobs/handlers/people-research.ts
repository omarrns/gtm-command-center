import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { researchPeople } from "@/lib/pipeline/people-search";

export async function runPeopleResearchJob(job: JobRow, svc: SupabaseClient) {
  const { company_name, role_title, report_id } = job.payload as {
    company_name: string;
    role_title: string;
    report_id: string;
  };

  const { researchResult } = await researchPeople(
    company_name,
    role_title,
    job.user_id,
  );

  await svc
    .from("research_reports")
    .update({ status: "complete", result: researchResult })
    .eq("id", report_id)
    .eq("user_id", job.user_id);

  return researchResult;
}
