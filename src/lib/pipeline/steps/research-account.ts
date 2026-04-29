import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow } from "@/lib/supabase/types";
import { exaSearch, formatExaResults } from "@/lib/ai/exa";
import { firecrawlScrape } from "@/lib/ai/firecrawl";
import { runGenerateObject, type AiCallScope } from "@/lib/ai/calls";
import { advanceStage } from "@/lib/pipeline/opportunities";
import { MODELS } from "@/lib/ai/anthropic";

const PIPELINE_MODEL = MODELS.sonnet;

export const gtmAccountResearchSchema = z.object({
  techStack: z.object({
    current: z.array(z.string()),
    gaps: z.array(z.string()),
  }),
  recentFunding: z
    .object({
      stage: z.string(),
      amount_usd: z.number().nullable(),
      closed_at: z.string().nullable(),
      investors: z.array(z.string()),
    })
    .nullable(),
  recentNews: z.array(
    z.object({
      headline: z.string(),
      url: z.string().url(),
      published_at: z.string().nullable(),
      relevance: z.string(),
    }),
  ),
  hiringTrajectory: z.object({
    net_30d: z.number().nullable(),
    trend: z.enum(["accelerating", "steady", "slowing"]),
    signal_roles: z.array(z.string()),
  }),
  competitorMentions: z.array(
    z.object({
      competitor: z.string(),
      context: z.string(),
      source_url: z.string().url(),
    }),
  ),
});

export type GtmAccountResearch = z.infer<typeof gtmAccountResearchSchema>;

export async function researchOneGtmAccount(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
  runId?: string,
): Promise<{ researched: boolean; reportId: string | null }> {
  const { data: oppRaw, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const opp = oppRaw as OpportunityRow | null;
  if (!opp || opp.stage !== "scored") {
    return { researched: false, reportId: opp?.research_id ?? null };
  }

  const [overview, tech, funding, news, hiring, site] = await Promise.all([
    exaSearch({
      query: `${opp.company_name} company overview product customers`,
      numResults: 5,
    }),
    exaSearch({
      query: `${opp.company_name} technology stack tools integrations`,
      numResults: 5,
    }),
    exaSearch({
      query: `${opp.company_name} funding round investors valuation`,
      numResults: 5,
    }),
    exaSearch({
      query: `${opp.company_name} recent news launch partnership competitor`,
      numResults: 5,
    }),
    exaSearch({
      query: `${opp.company_name} hiring jobs ${opp.role_title ?? ""}`,
      numResults: 5,
    }),
    scrapeCompanySiteQuietly(opp.company_domain),
  ]);

  const scope: AiCallScope = {
    userId,
    runId,
    scopeTable: "opportunities",
    scopeId: opp.id,
    callPurpose: "gtm-account-research",
  };

  const result = await runGenerateObject({
    model: PIPELINE_MODEL,
    system:
      "You are a GTM account researcher. Return only structured evidence useful for account prioritization and outbound planning.",
    prompt: [
      `Company: ${opp.company_name}`,
      `Domain: ${opp.company_domain ?? "unknown"}`,
      `Hiring role signal: ${opp.role_title ?? "unknown"}`,
      "",
      "Use the supplied search evidence. Keep arrays concise and grounded in URLs where available.",
      "",
      formatExaResults(overview, "Overview"),
      formatExaResults(tech, "Technology"),
      formatExaResults(funding, "Funding"),
      formatExaResults(news, "Recent News"),
      formatExaResults(hiring, "Hiring"),
      `### Company Site\n\n${site.slice(0, 4000) || "(not available)"}`,
    ].join("\n"),
    schema: gtmAccountResearchSchema,
    maxOutputTokens: 4096,
    scope,
  });

  const { data: report, error: reportError } = await svc
    .from("research_reports")
    .insert({
      user_id: userId,
      company_name: opp.company_name,
      role_title: opp.role_title,
      research_type: "gtm-account-research",
      status: "complete",
      input: {
        company_name: opp.company_name,
        company_domain: opp.company_domain,
        source: "gtm-find-contacts",
      },
      result,
    })
    .select("id")
    .single();

  if (reportError) throw reportError;

  const advanced = await advanceStage(
    svc,
    opp.id,
    userId,
    "scored",
    "researched",
    {
      research_id: report.id,
      last_error: null,
    },
  );
  if (!advanced) {
    throw new Error(
      `Stage precondition missed: expected 'scored' for opportunity ${opp.id}`,
    );
  }

  return { researched: true, reportId: report.id as string };
}

async function scrapeCompanySiteQuietly(
  domain: string | null,
): Promise<string> {
  if (!domain) return "";
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  try {
    return await firecrawlScrape(url);
  } catch {
    return "";
  }
}
