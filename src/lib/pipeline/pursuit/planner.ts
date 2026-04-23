/**
 * Pursuit Planner — bounded decision-making for scored opportunities.
 *
 * Phase 13B: single structured Claude call per opportunity that decides
 * pursuit strategy without executing any side effects. The planner
 * cannot write to Supabase or call external tools — it returns a plan
 * that the deterministic executor (13C) follows.
 *
 * Budget: one planner call per pursued opportunity, max 5 per pipeline run.
 * Model: claude-sonnet-4-6 (fast structured output, ~500-800 tokens/call).
 * Expected external API calls per opportunity (happy path): 1 people search + 1 enrichment + 1 draft = 3.
 * Worst-case bounded: 3 fallback targets × (1 search + 1 enrichment) + 1 draft = 7.
 */

import { runClaudeJson } from "@/lib/ai/anthropic";
import type {
  OpportunityRow,
  UserScoringProfileRow,
} from "@/lib/supabase/types";
import type { SenderIdentity } from "@/lib/skills/sender-identity";
import type { AiCallScope } from "@/lib/ai/calls";

/* ── PursuitPlan — the planner's output contract ─────────────────── */

export type PursuitMode = "deep" | "standard" | "light" | "skip";
export type ContactArchetype =
  | "founder"
  | "hiring_manager"
  | "department_head"
  | "recruiter";

export interface PursuitPlan {
  mode: PursuitMode;
  target_contact: ContactArchetype;
  fallback_target_order: ContactArchetype[];
  watchlist_recommendation: boolean;
  skip_reason:
    | "low_signal_role"
    | "poor_fit"
    | "no_realistic_contact_path"
    | "company_red_flag"
    | null;
  confidence: "low" | "medium" | "high";
  rationale_summary: string;
}

/* ── Planner input context ───────────────────────────────────────── */

export interface PlannerContext {
  opportunity: OpportunityRow;
  analysisResult: Record<string, unknown>;
  sender: SenderIdentity;
  scoreThreshold: number;
  scoringProfile: UserScoringProfileRow | null;
  /** Optional capture scope. When omitted, the call won't be captured. */
  scope?: AiCallScope;
}

/* ── Main planner function ───────────────────────────────────────── */

const PLANNER_MODEL = "claude-sonnet-4-6";

export async function planPursuit(ctx: PlannerContext): Promise<PursuitPlan> {
  const system = buildPlannerSystemPrompt(ctx);
  const prompt = buildPlannerUserPrompt(ctx);

  const plan = await runClaudeJson<PursuitPlan>({
    system,
    prompt,
    model: PLANNER_MODEL,
    maxTokens: 1024,
    scope: ctx.scope ?? {
      scopeTable: "opportunities",
      scopeId: ctx.opportunity.id,
      callPurpose: "plan_pursuit",
    },
  });

  // Validate and clamp the output
  return validatePlan(plan);
}

/* ── System prompt ───────────────────────────────────────────────── */

function buildPlannerSystemPrompt(ctx: PlannerContext): string {
  const parts: string[] = [
    `You are a pursuit strategy planner for a job search pipeline. Given a scored opportunity with analysis, decide the optimal outreach strategy.`,
    ``,
    `## Your job`,
    `Return a JSON object with exactly these fields:`,
    `- mode: "deep" | "standard" | "light" | "skip"`,
    `- target_contact: "founder" | "hiring_manager" | "department_head" | "recruiter"`,
    `- fallback_target_order: array of contact archetypes to try if primary fails (max 2)`,
    `- watchlist_recommendation: boolean — true if company is worth monitoring even if this role is skipped`,
    `- skip_reason: "low_signal_role" | "poor_fit" | "no_realistic_contact_path" | "company_red_flag" | null`,
    `- confidence: "low" | "medium" | "high"`,
    `- rationale_summary: string (max 240 chars) — brief explanation for logs`,
    ``,
    `## Mode guidance`,
    `- deep: high-conviction opportunity. Score well above threshold, strong fit signals, company is strategically interesting. Justify spending full research/enrichment budget.`,
    `- standard: good opportunity with a credible contact path. Normal research and enrichment effort.`,
    `- light: borderline-but-viable. Make one efficient pass at finding a contact. If not easy, stop.`,
    `- skip: low-confidence or clearly poor fit. Do not spend research/enrichment budget.`,
    ``,
    `## Contact targeting guidance`,
    `- Startups (<50 people, pre-seed through Series A): target founder or CEO directly.`,
    `- Mid-size (50-500, Series B through growth): target hiring manager or department head for the role.`,
    `- Enterprise (500+): target hiring manager specifically — C-suite is too far removed.`,
    `- If the role title contains "Head of" / "VP" / "Director": the hiring manager is likely a C-suite exec.`,
    `- recruiter: only as last resort when no other contact path is realistic.`,
    ``,
    `## Skip vs light boundary`,
    `- light: the opportunity is borderline but worth one efficient attempt. The score is near threshold, or the role is interesting but the fit signals are mixed.`,
    `- skip: the opportunity is clearly below bar, has red flags that disqualify it, or the sender has no realistic angle to pursue it.`,
    ``,
    `## Sender context`,
    `Name: ${ctx.sender.fullName}`,
    `Positioning: ${ctx.sender.positioning}`,
  ];

  if (ctx.sender.recentCompany) {
    parts.push(
      `Recent company: ${ctx.sender.recentCompany} (${ctx.sender.recentCompanyDescriptor ?? ""})`,
    );
  }
  if (ctx.sender.recentRole) {
    parts.push(`Recent role: ${ctx.sender.recentRole}`);
  }
  if (ctx.sender.tools.length > 0) {
    parts.push(`Tools: ${ctx.sender.tools.join(", ")}`);
  }

  // Scoring profile context (if available)
  if (ctx.scoringProfile) {
    const sp = ctx.scoringProfile;
    if (sp.preferred_stages.length > 0) {
      parts.push(`Preferred company stages: ${sp.preferred_stages.join(", ")}`);
    }
    if (sp.preferred_domains.length > 0) {
      parts.push(`Preferred domains: ${sp.preferred_domains.join(", ")}`);
    }
    if (sp.dealbreaker_patterns.length > 0) {
      parts.push(`Dealbreaker patterns: ${sp.dealbreaker_patterns.join(", ")}`);
    }
    if (sp.green_flags.length > 0) {
      parts.push(`Green flags: ${sp.green_flags.join(", ")}`);
    }
    if (sp.red_flags.length > 0) {
      parts.push(`Red flags: ${sp.red_flags.join(", ")}`);
    }
  }

  parts.push(``, `Score threshold: ${ctx.scoreThreshold}`, ``);
  parts.push(
    `Respond with valid JSON only. No markdown, no explanation outside the JSON.`,
  );

  return parts.join("\n");
}

/* ── User prompt (opportunity-specific) ──────────────────────────── */

function buildPlannerUserPrompt(ctx: PlannerContext): string {
  const opp = ctx.opportunity;
  const analysis = ctx.analysisResult;

  const parts: string[] = [
    `## Opportunity`,
    `Company: ${opp.company_name}`,
    `Role: ${opp.role_title}`,
    `Score: ${opp.score ?? "N/A"} / 100`,
    `Stage badge: ${opp.stage}`,
  ];

  if (opp.job_url) {
    parts.push(`Job URL: ${opp.job_url}`);
  }

  // Analysis verdicts
  const jdFit = analysis.jd_fit as Record<string, unknown> | undefined;
  const strategicFit = analysis.strategic_fit as
    | Record<string, unknown>
    | undefined;
  const companyOverview = analysis.company_overview as
    | Record<string, unknown>
    | undefined;
  const flags = analysis.flags as Record<string, string[]> | undefined;

  if (jdFit?.verdict) {
    parts.push(`JD Fit verdict: ${jdFit.verdict}`);
  }
  if (strategicFit?.verdict) {
    parts.push(`Strategic Fit verdict: ${strategicFit.verdict}`);
  }

  // Company context
  if (companyOverview) {
    if (companyOverview.what_they_do) {
      parts.push(`What they do: ${companyOverview.what_they_do}`);
    }
    if (companyOverview.stage_and_funding) {
      parts.push(`Stage & funding: ${companyOverview.stage_and_funding}`);
    }
    if (companyOverview.gtm_motion) {
      parts.push(`GTM motion: ${companyOverview.gtm_motion}`);
    }
    const founder = companyOverview.founder_profile as
      | Record<string, unknown>
      | undefined;
    if (founder?.name) {
      parts.push(
        `Founder: ${founder.name} — ${founder.background ?? "unknown background"}`,
      );
    }
  }

  // Flags
  if (flags?.green?.length) {
    parts.push(`Green flags: ${flags.green.join("; ")}`);
  }
  if (flags?.red?.length) {
    parts.push(`Red flags: ${flags.red.join("; ")}`);
  }

  // Bottom line from analysis
  if (analysis.bottom_line) {
    parts.push(`Bottom line: ${analysis.bottom_line}`);
  }

  return parts.join("\n");
}

/* ── Validation — clamp output to contract ───────────────────────── */

const VALID_MODES: PursuitMode[] = ["deep", "standard", "light", "skip"];
const VALID_ARCHETYPES: ContactArchetype[] = [
  "founder",
  "hiring_manager",
  "department_head",
  "recruiter",
];
const VALID_SKIP_REASONS = [
  "low_signal_role",
  "poor_fit",
  "no_realistic_contact_path",
  "company_red_flag",
] as const;

function validatePlan(raw: PursuitPlan): PursuitPlan {
  const mode = VALID_MODES.includes(raw.mode) ? raw.mode : "standard";

  const target_contact = VALID_ARCHETYPES.includes(raw.target_contact)
    ? raw.target_contact
    : "hiring_manager";

  const fallback_target_order = (raw.fallback_target_order ?? [])
    .filter((a): a is ContactArchetype => VALID_ARCHETYPES.includes(a))
    .filter((a) => a !== target_contact)
    .slice(0, 2);

  const watchlist_recommendation =
    typeof raw.watchlist_recommendation === "boolean"
      ? raw.watchlist_recommendation
      : false;

  const skip_reason =
    mode === "skip"
      ? VALID_SKIP_REASONS.includes(
          raw.skip_reason as (typeof VALID_SKIP_REASONS)[number],
        )
        ? raw.skip_reason
        : "poor_fit"
      : null;

  const confidence = ["low", "medium", "high"].includes(raw.confidence)
    ? raw.confidence
    : "medium";

  const rationale_summary =
    typeof raw.rationale_summary === "string"
      ? raw.rationale_summary.slice(0, 240)
      : "";

  return {
    mode,
    target_contact,
    fallback_target_order,
    watchlist_recommendation,
    skip_reason,
    confidence,
    rationale_summary,
  };
}
