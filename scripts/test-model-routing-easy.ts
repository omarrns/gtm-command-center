#!/usr/bin/env tsx
/**
 * Live model-routing gate for the easy non-Claude switches.
 *
 * Primary corpus: recent captured ai_calls prompts for the target purposes.
 * Synthetic fixtures only cover edge cases that may be missing from captures.
 *
 * Usage:
 *   pnpm test:model-routing-easy
 *   pnpm test:model-routing-easy -- --limit=5 --since=30d
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createSupabaseServiceClient } from "../src/lib/supabase/service";
import { MODELS } from "../src/lib/ai/models";
import { runClaudeJson } from "../src/lib/ai/anthropic";
import {
  buildJdFitRubricPrompt,
  buildJdFitRubricSystem,
} from "../src/lib/skills/prompts/jd-fit-rubric";
import {
  buildCompanyFitAnalyzerPrompt,
  buildCompanyFitAnalyzerSystem,
} from "../src/lib/skills/prompts/company-fit-analyzer";
import type { SenderIdentity } from "../src/lib/skills/sender-identity";

type Purpose =
  | "manual_inject_extract"
  | "jd_fit_rubric"
  | "company_fit_analyzer";

interface AiCallRow {
  id: string;
  created_at: string;
  user_id: string | null;
  scope_table: string | null;
  scope_id: string | null;
  call_purpose: Purpose;
  system_prompt: string | null;
  user_prompt: string | null;
}

interface EvalCase {
  name: string;
  purpose: Purpose;
  system: string;
  prompt: string;
  source: "captured" | "synthetic";
  sourceId?: string;
  expected?: {
    companyNameIncludes?: string;
    roleTitleIncludes?: string;
  };
  scope?: {
    userId?: string;
    scopeTable?: string;
    scopeId?: string;
  };
}

interface CliArgs {
  limit: number;
  since: string;
}

const PURPOSES: Purpose[] = [
  "manual_inject_extract",
  "jd_fit_rubric",
  "company_fit_analyzer",
];

const PRIMARY_MODELS: Record<Purpose, string> = {
  manual_inject_extract: MODELS.tinyExtraction,
  jd_fit_rubric: MODELS.analysisSynthesis,
  company_fit_analyzer: MODELS.analysisSynthesis,
};

async function main() {
  const args = parseArgs();
  const cases = [
    ...(await loadCapturedCases(args)),
    ...syntheticCases(),
  ];

  if (cases.length === 0) {
    throw new Error("No captured or synthetic cases available.");
  }

  const results: Array<{ ok: boolean; label: string; error?: string }> = [];
  for (const testCase of cases) {
    const model = PRIMARY_MODELS[testCase.purpose];
    const label = `${testCase.source}:${testCase.purpose}:${testCase.name}`;
    const started = Date.now();
    try {
      const output = await runClaudeJson<Record<string, unknown>>({
        system: testCase.system,
        prompt: testCase.prompt,
        model,
        maxTokens: testCase.purpose === "manual_inject_extract" ? 128 : 4096,
        scope: testCase.scope
          ? {
              userId: testCase.scope.userId,
              scopeTable: testCase.scope.scopeTable,
              scopeId: testCase.scope.scopeId,
              callPurpose: `model_routing_eval:${testCase.purpose}`,
            }
          : undefined,
      });
      const validationError = validateOutput(testCase, output);
      if (validationError) throw new Error(validationError);
      console.log(`PASS ${label} ${model} ${Date.now() - started}ms`);
      results.push({ ok: true, label });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAIL ${label} ${model}: ${message}`);
      results.push({ ok: false, label, error: message });
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\nModel-routing easy gate: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length > 0) {
    for (const failure of failed) {
      console.log(`  - ${failure.label}: ${failure.error}`);
    }
    process.exit(1);
  }
}

async function loadCapturedCases(args: CliArgs): Promise<EvalCase[]> {
  let svc: ReturnType<typeof createSupabaseServiceClient>;
  try {
    svc = createSupabaseServiceClient();
  } catch (err) {
    console.warn(
      `Skipping captured ai_calls corpus: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }

  const cases: EvalCase[] = [];
  for (const purpose of PURPOSES) {
    const { data, error } = await svc
      .from("ai_calls")
      .select(
        "id, created_at, user_id, scope_table, scope_id, call_purpose, system_prompt, user_prompt",
      )
      .eq("call_purpose", purpose)
      .eq("call_kind", "json")
      .is("error", null)
      .not("system_prompt", "is", null)
      .not("user_prompt", "is", null)
      .gte("created_at", sinceIso(args.since))
      .order("created_at", { ascending: false })
      .limit(args.limit);
    if (error) throw error;

    for (const row of (data ?? []) as AiCallRow[]) {
      cases.push({
        name: row.id,
        purpose,
        system: row.system_prompt ?? "",
        prompt: row.user_prompt ?? "",
        source: "captured",
        sourceId: row.id,
        scope: {
          userId: row.user_id ?? undefined,
          scopeTable: row.scope_table ?? undefined,
          scopeId: row.scope_id ?? undefined,
        },
      });
    }
  }

  console.log(`Loaded ${cases.length} captured ai_calls cases.`);
  return cases;
}

function syntheticCases(): EvalCase[] {
  const sender = syntheticSender();
  return [
    {
      name: "greenhouse-job-post",
      purpose: "manual_inject_extract",
      source: "synthetic",
      system:
        "Extract the hiring company name and exact job title from the job posting. Return JSON with keys company_name and role_title only.",
      prompt: `# Senior Product Marketing Manager

Greenhouse

Apply for this job

About Greenhouse
Greenhouse is the hiring operating system for people-first companies.

The role
We are seeking a Senior Product Marketing Manager to lead launches for our enterprise platform.`,
      expected: {
        companyNameIncludes: "Greenhouse",
        roleTitleIncludes: "Senior Product Marketing Manager",
      },
    },
    {
      name: "lever-job-post",
      purpose: "manual_inject_extract",
      source: "synthetic",
      system:
        "Extract the hiring company name and exact job title from the job posting. Return JSON with keys company_name and role_title only.",
      prompt: `# Account Executive, Mid-Market

at Mercury

Mercury is building banking for ambitious companies. This Lever-hosted page contains navigation, benefits, and equal opportunity text.

We are hiring an Account Executive, Mid-Market to own full-cycle sales.`,
      expected: {
        companyNameIncludes: "Mercury",
        roleTitleIncludes: "Account Executive",
      },
    },
    {
      name: "workday-noisy-post",
      purpose: "manual_inject_extract",
      source: "synthetic",
      system:
        "Extract the hiring company name and exact job title from the job posting. Return JSON with keys company_name and role_title only.",
      prompt: `Search Jobs | Workday

Privacy Notice Cookie Preferences Similar Jobs

Stripe
GTM Systems Engineer
Remote - United States

About the team
The Revenue Systems team builds tools for sales and customer operations.`,
      expected: {
        companyNameIncludes: "Stripe",
        roleTitleIncludes: "GTM Systems Engineer",
      },
    },
    {
      name: "jd-fit-minimal",
      purpose: "jd_fit_rubric",
      source: "synthetic",
      system: buildJdFitRubricSystem(sender),
      prompt: buildJdFitRubricPrompt({
        companyName: "Acme",
        roleTitle: "RevOps Engineer",
        memory:
          "Candidate: GTM engineer with Salesforce, HubSpot, SQL, outbound automation, lifecycle marketing, attribution dashboards, and sales leadership partnership experience.",
        jobDescription:
          "Requirements: own Salesforce workflows, build attribution dashboards, partner with sales leadership, automate outbound routing, document process, and improve funnel reporting.",
      }),
    },
    {
      name: "company-fit-minimal",
      purpose: "company_fit_analyzer",
      source: "synthetic",
      system: buildCompanyFitAnalyzerSystem(sender),
      prompt: buildCompanyFitAnalyzerPrompt({
        companyName: "Acme AI",
        memory:
          "Candidate: GTM engineer focused on AI sales tooling, lifecycle automation, support-led growth, and customer support software.",
        research:
          "Acme AI sells AI support automation to B2B SaaS companies.\nFunding: Series A, 80 employees.\nGTM motion: product-led with sales assist.\nRecent signals: launched Zendesk integration; hiring enterprise AEs; announced SOC 2; published a case study with a PLG SaaS company.\nFounder profile: former support leader and ML engineer building for customer operations teams.",
      }),
    },
  ];
}

function syntheticSender(): SenderIdentity {
  return {
    firstName: "Alex",
    fullName: "Alex Smith",
    positioning: "GTM engineer focused on automation and pipeline tooling.",
    tools: ["Salesforce", "HubSpot", "SQL", "Lifecycle automation"],
    proofPoints: [
      "Built attribution dashboards for sales leadership",
      "Automated outbound routing across multiple GTM systems",
      "Shipped lifecycle campaigns for B2B SaaS teams",
    ],
    outreachTone: "direct",
    recentCompany: "Inkeep",
    recentCompanyDescriptor: "AI customer support platform",
    recentRole: "Built GTM systems and customer support automation",
    domainInsiderClaim: "worked in AI support tooling and GTM automation",
    signOff: "Alex",
  };
}

function validateOutput(
  testCase: EvalCase,
  output: Record<string, unknown>,
): string | null {
  if (testCase.purpose === "manual_inject_extract") {
    const base = validateManualExtraction(output);
    if (base) return base;
    const company = String(output.company_name);
    const role = String(output.role_title);
    if (
      testCase.expected?.companyNameIncludes &&
      !company
        .toLowerCase()
        .includes(testCase.expected.companyNameIncludes.toLowerCase())
    ) {
      return `company_name "${company}" did not include "${testCase.expected.companyNameIncludes}"`;
    }
    if (
      testCase.expected?.roleTitleIncludes &&
      !role
        .toLowerCase()
        .includes(testCase.expected.roleTitleIncludes.toLowerCase())
    ) {
      return `role_title "${role}" did not include "${testCase.expected.roleTitleIncludes}"`;
    }
    return null;
  }

  if (testCase.purpose === "jd_fit_rubric") {
    return validateJdFitRubricOutput(output);
  }

  return validateCompanyFitOutput(output);
}

function validateManualExtraction(value: Record<string, unknown>): string | null {
  if (!isNonEmptyString(value.company_name)) {
    return "company_name must be a non-empty string";
  }
  if (!isNonEmptyString(value.role_title)) {
    return "role_title must be a non-empty string";
  }
  return null;
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

function parseArgs(): CliArgs {
  const argMap = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) {
      argMap.set(raw.slice(2), "true");
    } else {
      argMap.set(raw.slice(2, eq), raw.slice(eq + 1));
    }
  }

  const limitRaw = argMap.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 5;
  if (!Number.isFinite(limit) || limit <= 0 || limit > 50) {
    throw new Error(`--limit must be a positive integer <= 50 (got ${limitRaw})`);
  }

  return {
    limit,
    since: argMap.get("since") ?? "30d",
  };
}

function sinceIso(since: string): string {
  const match = since.match(/^(\d+)([hd])$/);
  if (!match) {
    throw new Error(`--since must be like "24h" or "30d" (got "${since}")`);
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const factor = unit === "h" ? 3600_000 : 86400_000;
  return new Date(Date.now() - value * factor).toISOString();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
