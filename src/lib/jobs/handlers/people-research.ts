import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { exaSearch, formatExaResults } from "@/lib/ai/exa";
import {
  PEOPLE_RESEARCH_SYSTEM,
  buildPeopleResearchPrompt,
} from "@/lib/skills/prompts/people-research";

export async function runPeopleResearchJob(job: JobRow, svc: SupabaseClient) {
  const { company_name, role_title, report_id } = job.payload as {
    company_name: string;
    role_title: string;
    report_id: string;
  };

  // 1. Multi-query research
  const [ceoResults, hmResults, teamPage] = await Promise.all([
    exaSearch({
      query: `${company_name} CEO OR founder`,
      numResults: 5,
      includeDomains: ["linkedin.com"],
    }),
    exaSearch({
      query: `${company_name} VP Marketing OR Head of Growth OR Head of Marketing site:linkedin.com`,
      numResults: 5,
    }),
    exaSearch({
      query: `${company_name} team leadership about page`,
      numResults: 3,
    }),
  ]);

  const research = [
    formatExaResults(ceoResults, "CEO / Founder Search"),
    formatExaResults(hmResults, "Hiring Manager Search"),
    formatExaResults(teamPage, "Team / About Page"),
  ].join("\n\n");

  // 2. Claude synthesis with attribution gates
  const result = await runClaudeJson({
    system: PEOPLE_RESEARCH_SYSTEM,
    prompt: buildPeopleResearchPrompt({
      companyName: company_name,
      roleTitle: role_title,
      research,
    }),
    maxTokens: 4096,
  });

  // 3. Update research_reports row
  await svc
    .from("research_reports")
    .update({ status: "complete", result })
    .eq("id", report_id)
    .eq("user_id", job.user_id);

  return result as Record<string, unknown>;
}
