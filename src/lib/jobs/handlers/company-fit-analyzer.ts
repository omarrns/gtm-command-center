import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { exaFindCompany, formatExaResults } from "@/lib/ai/exa";
import {
  COMPANY_FIT_ANALYZER_SYSTEM,
  buildCompanyFitAnalyzerPrompt,
} from "@/lib/skills/prompts/company-fit-analyzer";

export async function runCompanyFitAnalyzerJob(
  job: JobRow,
  svc: SupabaseClient,
) {
  const { company_name, analysis_id } = job.payload as {
    company_name: string;
    analysis_id: string;
  };

  // 1. Run web research via Exa
  const rawResearch = await exaFindCompany(company_name);
  const research = [
    formatExaResults(rawResearch.overview, "Company Overview"),
    formatExaResults(rawResearch.funding, "Funding & Stage"),
    formatExaResults(rawResearch.news, "Recent News"),
  ].join("\n\n");

  // 2. Load Omar's memory context via service-role
  const { data: memDocs } = await svc
    .from("memory_documents")
    .select("document_key, title, content")
    .eq("user_id", job.user_id);

  const memory = (memDocs ?? [])
    .map((d) => `## ${d.title}\n\n${d.content}`)
    .join("\n\n---\n\n");

  // 3. Synthesize via Claude
  const result = await runClaudeJson({
    system: COMPANY_FIT_ANALYZER_SYSTEM,
    prompt: buildCompanyFitAnalyzerPrompt({
      companyName: company_name,
      research,
      memory,
    }),
    maxTokens: 4096,
  });

  // 4. Update the analysis row with the completed result
  await svc
    .from("analyses")
    .update({ status: "complete", result })
    .eq("id", analysis_id)
    .eq("user_id", job.user_id);

  return result as Record<string, unknown>;
}
