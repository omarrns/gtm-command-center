import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS } from "@/lib/ai/anthropic";
import { firecrawlScrape } from "@/lib/ai/firecrawl";
import { runJsonWithFallback } from "@/lib/ai/json-with-fallback";
import { createLogger, type Logger } from "@/lib/logger";
import { createOpportunity } from "@/lib/pipeline/opportunities";
import { scoreOneOpportunity } from "@/lib/pipeline/steps/score";
import { buildManualJobExtractionPrompt } from "@/lib/skills/prompts/manual-job-extraction";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type {
  OpportunityRow,
  PipelineConfigRow,
} from "@/lib/supabase/types";

export interface ManualInjectOpportunityInput {
  userId: string;
  jobUrl: string;
}

export interface ManualInjectOpportunityResult {
  ok: boolean;
  error?: string;
  score?: number;
  stage?: string;
  companyName?: string;
  roleTitle?: string;
}

export interface ManualInjectOpportunityDeps {
  svc?: SupabaseClient;
  log?: Logger;
  firecrawlScrapeImpl?: typeof firecrawlScrape;
}

interface ManualInjectContext extends ManualInjectOpportunityInput {
  svc: SupabaseClient;
  log: Logger;
  firecrawlScrapeImpl: typeof firecrawlScrape;
}

interface ManualJobExtraction {
  company_name: string;
  role_title: string;
}

type ResultWithValue<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export async function manuallyInjectOpportunity(
  input: ManualInjectOpportunityInput,
  deps: ManualInjectOpportunityDeps = {},
): Promise<ManualInjectOpportunityResult> {
  const ctx = resolveManualInjectContext(input, deps);
  const config = await loadPipelineConfig(ctx);
  if (!config.ok) return config;

  const markdown = await scrapeJobMarkdown(ctx);
  if (!markdown.ok) return markdown;

  const parsed = await extractManualJobIdentity(ctx.userId, markdown.value);
  const opp = await createManualJobOpportunity(ctx, markdown.value, parsed);
  if (!opp.ok) return opp;

  return scoreManualJobOpportunity(ctx, config.value, opp.value, parsed);
}

function resolveManualInjectContext(
  input: ManualInjectOpportunityInput,
  deps: ManualInjectOpportunityDeps,
): ManualInjectContext {
  const svc = deps.svc ?? createSupabaseServiceClient();
  const log =
    deps.log ??
    createLogger({
      scope: "pipeline.manualInject",
      userId: input.userId,
      jobUrl: input.jobUrl,
    });
  const firecrawlScrapeImpl = deps.firecrawlScrapeImpl ?? firecrawlScrape;

  return { ...input, svc, log, firecrawlScrapeImpl };
}

async function loadPipelineConfig(
  ctx: ManualInjectContext,
): Promise<ResultWithValue<PipelineConfigRow>> {
  const { data: config, error: configError } = await ctx.svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", ctx.userId)
    .single();

  if (configError || !config) {
    ctx.log.warn("pipeline_config missing");
    return { ok: false, error: "Pipeline config not found" };
  }

  return { ok: true, value: config as PipelineConfigRow };
}

async function scrapeJobMarkdown(
  ctx: ManualInjectContext,
): Promise<ResultWithValue<string>> {
  try {
    const markdown = await ctx.firecrawlScrapeImpl(ctx.jobUrl);
    if (markdown.trim()) return { ok: true, value: markdown };
    ctx.log.warn("scraped page is empty");
    return { ok: false, error: "Job page returned empty content" };
  } catch (err) {
    ctx.log.error("firecrawl scrape failed", err);
    return {
      ok: false,
      error: `Could not fetch the job page: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function extractManualJobIdentity(
  userId: string,
  markdown: string,
): Promise<ManualJobExtraction> {
  const prompt = buildManualJobExtractionPrompt(markdown);
  return runJsonWithFallback<ManualJobExtraction>({
    system: prompt.system,
    prompt: prompt.prompt,
    primaryModel: MODELS.tinyExtraction,
    fallbackModel: MODELS.haiku,
    maxTokens: 128,
    scope: { userId, callPurpose: "manual_inject_extract" },
    validate: validateManualInjectExtraction,
  });
}

async function createManualJobOpportunity(
  ctx: ManualInjectContext,
  markdown: string,
  parsed: ManualJobExtraction,
): Promise<ResultWithValue<OpportunityRow>> {
  const opp = await createOpportunity(ctx.svc, ctx.userId, {
    source: "manual",
    external_id: ctx.jobUrl,
    company_name: parsed.company_name,
    role_title: parsed.role_title,
    job_url: ctx.jobUrl,
    job_description: markdown,
  });

  if (!opp) {
    ctx.log.info("dedup hit — already added in last 30 days");
    return {
      ok: false,
      error: "Duplicate — this role was already added within the last 30 days",
    };
  }

  return { ok: true, value: opp };
}

async function scoreManualJobOpportunity(
  ctx: ManualInjectContext,
  config: PipelineConfigRow,
  opp: OpportunityRow,
  parsed: ManualJobExtraction,
): Promise<ManualInjectOpportunityResult> {
  const { newStage, normalizedScore } = await scoreOneOpportunity(
    ctx.svc,
    ctx.userId,
    opp,
    config,
    { source: "manual" },
  );

  ctx.log.info("injected + scored", {
    opportunityId: opp.id,
    company: parsed.company_name,
    role: parsed.role_title,
    score: normalizedScore,
    newStage,
  });
  return {
    ok: true,
    score: normalizedScore,
    stage: newStage,
    companyName: parsed.company_name,
    roleTitle: parsed.role_title,
  };
}

function validateManualInjectExtraction(value: ManualJobExtraction): string | null {
  if (typeof value.company_name !== "string" || !value.company_name.trim()) {
    return "company_name must be a non-empty string";
  }
  if (typeof value.role_title !== "string" || !value.role_title.trim()) {
    return "role_title must be a non-empty string";
  }
  return null;
}
