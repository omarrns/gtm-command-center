import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { exaFindCompany, formatExaResults } from "@/lib/ai/exa";
import {
  buildCompanyFitAnalyzerSystem,
  buildCompanyFitAnalyzerPrompt,
} from "@/lib/skills/prompts/company-fit-analyzer";
import { loadMemoryContext, formatMemoryForPrompt } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";

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

  // 2. Load user's memory context via service-role
  const memoryCtx = await loadMemoryContext(job.user_id, svc);
  const memory = formatMemoryForPrompt(memoryCtx);
  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);

  // 3. Synthesize via Claude
  const result = await runClaudeJson({
    system: buildCompanyFitAnalyzerSystem(sender),
    prompt: buildCompanyFitAnalyzerPrompt({
      companyName: company_name,
      research,
      memory,
    }),
    maxTokens: 4096,
    scope: {
      userId: job.user_id,
      scopeTable: "analyses",
      scopeId: analysis_id,
      callPurpose: "company_fit_analyzer",
    },
  });

  // 4. Update the analysis row with the completed result
  await svc
    .from("analyses")
    .update({ status: "complete", result })
    .eq("id", analysis_id)
    .eq("user_id", job.user_id);

  return result as Record<string, unknown>;
}
