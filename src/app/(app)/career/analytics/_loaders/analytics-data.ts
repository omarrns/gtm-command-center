import type { SupabaseClient } from "@supabase/supabase-js";

export type AnalyticsRow = {
  discovered_at: string;
  stage: string;
  score: number | null;
  job_is_remote: boolean | null;
  company_name: string;
  role_title: string;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  job_salary_period: string | null;
  job_required_skills: string[] | null;
};

export async function loadAnalyticsData(
  svc: SupabaseClient,
  userId: string,
): Promise<AnalyticsRow[]> {
  const { data, error } = await svc
    .from("opportunities")
    .select(
      "discovered_at, stage, score, job_is_remote, company_name, role_title, job_min_salary, job_max_salary, job_salary_currency, job_salary_period, job_required_skills",
    )
    .eq("user_id", userId)
    .order("discovered_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AnalyticsRow[];
}
