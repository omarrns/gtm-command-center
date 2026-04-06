import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { exaFindCompany, formatExaResults } from "@/lib/ai/exa";
import {
  FULL_ANALYSIS_SYSTEM,
  buildFullAnalysisPrompt,
} from "@/lib/skills/prompts/full-analysis";

export async function runFullAnalysisJob(job: JobRow, svc: SupabaseClient) {
  const { company_name, role_title, job_description, analysis_id } =
    job.payload as {
      company_name: string;
      role_title?: string;
      job_description: string;
      analysis_id: string;
    };

  // 1. Web research
  const rawResearch = await exaFindCompany(company_name);
  const research = [
    formatExaResults(rawResearch.overview, "Company Overview"),
    formatExaResults(rawResearch.funding, "Funding & Stage"),
    formatExaResults(rawResearch.news, "Recent News"),
  ].join("\n\n");

  // 2. Memory context
  const { data: memDocs } = await svc
    .from("memory_documents")
    .select("document_key, title, content")
    .eq("user_id", job.user_id);

  const memory = (memDocs ?? [])
    .map((d) => `## ${d.title}\n\n${d.content}`)
    .join("\n\n---\n\n");

  // 3. Claude synthesis
  const result = await runClaudeJson({
    system: FULL_ANALYSIS_SYSTEM,
    prompt: buildFullAnalysisPrompt({
      companyName: company_name,
      roleTitle: role_title,
      jobDescription: job_description,
      research,
      memory,
    }),
    maxTokens: 8192,
  });

  // 4. Update analysis row
  await svc
    .from("analyses")
    .update({ status: "complete", result })
    .eq("id", analysis_id)
    .eq("user_id", job.user_id);

  return result as Record<string, unknown>;
}
