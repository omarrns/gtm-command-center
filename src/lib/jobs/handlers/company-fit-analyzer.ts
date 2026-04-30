import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { MODELS } from "@/lib/ai/anthropic";
import { runJsonWithFallback } from "@/lib/ai/json-with-fallback";
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
  const result = await runJsonWithFallback<Record<string, unknown>>({
    system: buildCompanyFitAnalyzerSystem(sender),
    prompt: buildCompanyFitAnalyzerPrompt({
      companyName: company_name,
      research,
      memory,
    }),
    primaryModel: MODELS.analysisSynthesis,
    fallbackModel: MODELS.sonnet,
    maxTokens: 4096,
    scope: {
      userId: job.user_id,
      scopeTable: "analyses",
      scopeId: analysis_id,
      callPurpose: "company_fit_analyzer",
    },
    validate: validateCompanyFitOutput,
  });

  // 4. Update the analysis row with the completed result
  await svc
    .from("analyses")
    .update({ status: "complete", result })
    .eq("id", analysis_id)
    .eq("user_id", job.user_id);

  return result as Record<string, unknown>;
}

function validateCompanyFitOutput(value: Record<string, unknown>): string | null {
  if (!isNonEmptyString(value.bottom_line)) {
    return "bottom_line must be non-empty";
  }
  const recentSignals = countArrayEntries(value.recent_signals);
  const flagCount =
    countArrayEntries(value.green_flags) + countArrayEntries(value.red_flags);
  const outreachAngles = countArrayEntries(value.outreach_angles);
  if (Math.max(recentSignals, flagCount, outreachAngles) < 3) {
    return "at least one analysis array must include 3 meaningful entries";
  }
  if (outreachAngles < 1) {
    return "outreach_angles must include at least 1 entry";
  }
  if (!value.strategic_fit || typeof value.strategic_fit !== "object") {
    return "strategic_fit must be an object";
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function countArrayEntries(value: unknown): number {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}
