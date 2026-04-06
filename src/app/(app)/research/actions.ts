"use server";

import { requireUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { enqueueJob } from "@/lib/jobs/enqueue";

export async function enqueueResearchJobAction(formData: FormData) {
  const user = await requireUser();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const roleTitle = String(formData.get("role_title") ?? "").trim();
  const researchType = String(
    formData.get("research_type") ?? "people-research",
  ).trim();

  if (!companyName) return { error: "Company name is required." };
  if (!roleTitle) return { error: "Role title is required." };

  const supabase = await createSupabaseServerClient();

  const { data: report, error: rErr } = await supabase
    .from("research_reports")
    .insert({
      user_id: user.id,
      company_name: companyName,
      role_title: roleTitle,
      research_type: researchType,
      status: "pending",
      input: { company_name: companyName, role_title: roleTitle },
    })
    .select("id")
    .single();

  if (rErr || !report)
    return { error: rErr?.message ?? "Failed to create report." };

  const { jobId } = await enqueueJob({
    userId: user.id,
    type: "people-research",
    payload: {
      company_name: companyName,
      role_title: roleTitle,
      report_id: report.id,
    },
  });

  await supabase
    .from("research_reports")
    .update({ job_id: jobId, status: "running" })
    .eq("id", report.id);

  return { reportId: report.id, jobId };
}
