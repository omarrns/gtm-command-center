"use server";

import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { MODELS } from "@/lib/ai/anthropic";
import { runJsonWithFallback } from "@/lib/ai/json-with-fallback";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  buildJdFitRubricSystem,
  buildJdFitRubricPrompt,
} from "@/lib/skills/prompts/jd-fit-rubric";

// -- Tier 1: JD fit rubric (sync) --

export async function runJdRubricAction(formData: FormData) {
  const user = await requireUser();
  const jobDescription = String(formData.get("job_description") ?? "").trim();
  const companyName =
    String(formData.get("company_name") ?? "").trim() || undefined;
  const roleTitle =
    String(formData.get("role_title") ?? "").trim() || undefined;

  if (!jobDescription) return { error: "Job description is required." };

  const [ctx, supabase] = await Promise.all([
    loadMemoryContext(user.id),
    createSupabaseServerClient(),
  ]);
  const memory = formatMemoryForPrompt(ctx);
  const sender = extractSenderIdentity(ctx, ctx.displayName);

  const result = await runJsonWithFallback<Record<string, unknown>>({
    system: buildJdFitRubricSystem(sender),
    prompt: buildJdFitRubricPrompt({
      jobDescription,
      companyName,
      roleTitle,
      memory,
    }),
    primaryModel: MODELS.analysisSynthesis,
    fallbackModel: MODELS.sonnet,
    maxTokens: 4096,
    scope: { userId: user.id, callPurpose: "jd_fit_rubric" },
    validate: validateJdFitRubricOutput,
  });

  // Save analysis record
  const { data, error } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      skill_slug: "jd-fit-rubric",
      company_name:
        companyName ?? (result as Record<string, unknown>).company_name ?? null,
      role_title:
        roleTitle ?? (result as Record<string, unknown>).role_title ?? null,
      job_description: jobDescription,
      status: "complete",
      input: { company_name: companyName, role_title: roleTitle },
      result,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { analysisId: data.id, result };
}

function validateJdFitRubricOutput(value: Record<string, unknown>): string | null {
  if (!isNonEmptyString(value.bottom_line)) {
    return "bottom_line must be non-empty";
  }
  if (!Array.isArray(value.requirement_matches) || value.requirement_matches.length < 3) {
    return "requirement_matches must include at least 3 entries";
  }
  if (
    !Array.isArray(value.positioning_recommendations) ||
    value.positioning_recommendations.filter(isNonEmptyString).length < 3
  ) {
    return "positioning_recommendations must include at least 3 entries";
  }
  if (!value.scorecard || typeof value.scorecard !== "object") {
    return "scorecard must be an object";
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// -- Tier 2: Company fit analyzer (async) --

export async function enqueueCompanyAnalysisAction(formData: FormData) {
  const user = await requireUser();
  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { error: "Company name is required." };

  const supabase = await createSupabaseServerClient();

  // Create analysis placeholder
  const { data: analysis, error: aErr } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      skill_slug: "company-fit-analyzer",
      company_name: companyName,
      status: "running",
      input: { company_name: companyName },
    })
    .select("id")
    .single();

  if (aErr || !analysis)
    return { error: aErr?.message ?? "Failed to create analysis." };

  const { jobId } = await enqueueJob({
    userId: user.id,
    type: "company-fit-analyzer",
    payload: { company_name: companyName, analysis_id: analysis.id },
  });

  // Link job to analysis
  await supabase
    .from("analyses")
    .update({ job_id: jobId })
    .eq("id", analysis.id);

  return { analysisId: analysis.id, jobId };
}

// -- Tier 2: Full analysis (async) --

export async function enqueueFullAnalysisAction(formData: FormData) {
  const user = await requireUser();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const roleTitle =
    String(formData.get("role_title") ?? "").trim() || undefined;
  const jobDescription = String(formData.get("job_description") ?? "").trim();

  if (!companyName) return { error: "Company name is required." };
  if (!jobDescription) return { error: "Job description is required." };

  const supabase = await createSupabaseServerClient();

  const { data: analysis, error: aErr } = await supabase
    .from("analyses")
    .insert({
      user_id: user.id,
      skill_slug: "full-analysis",
      company_name: companyName,
      role_title: roleTitle,
      job_description: jobDescription,
      status: "running",
      input: { company_name: companyName, role_title: roleTitle },
    })
    .select("id")
    .single();

  if (aErr || !analysis)
    return { error: aErr?.message ?? "Failed to create analysis." };

  const { jobId } = await enqueueJob({
    userId: user.id,
    type: "full-analysis",
    payload: {
      company_name: companyName,
      role_title: roleTitle,
      job_description: jobDescription,
      analysis_id: analysis.id,
    },
  });

  await supabase
    .from("analyses")
    .update({ job_id: jobId })
    .eq("id", analysis.id);

  return { analysisId: analysis.id, jobId };
}
