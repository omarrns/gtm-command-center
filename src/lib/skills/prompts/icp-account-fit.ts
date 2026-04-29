/**
 * Prompt builder — ICP account fit scoring.
 *
 * Consumed by `scoreAccountAgainstIcp`. The model returns the legacy
 * six broad components (firmo_fit, techno_fit, ...), a per-sub-dimension
 * breakdown keyed by the canonical ICP_DIMENSIONS config, and verdict +
 * tier + reason_to_believe. The prompt is intentionally blunt — this
 * scores whether to pursue, not how to position.
 *
 * The full per-sub-dimension checklist comes from
 * `renderPromptChecklist({ mode: "full_scoring" })` so any change to
 * the canonical config flows into the scoring prompt without a manual
 * edit here.
 */

import { renderPromptChecklist } from "@/lib/onboarding/icp-dimensions";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import type { SenderIdentity } from "../sender-identity";

export function buildIcpAccountFitSystem(sender: SenderIdentity): string {
  return `You are scoring a target account against ${sender.fullName}'s ICP rubric for outbound GTM work.

Job: tell the AE in one line whether this account is worth pursuing, and why. Be honest — we are scoring fit, not pitching the company. Low scores are fine; false positives waste quota, false negatives are recoverable by running the pipeline again tomorrow.

PRINCIPLES:
- Ground every score in the rubric + evidence provided. No speculation.
- A clear disqualifier match (any disqualifier sub-dim scoring 1/5) MUST force verdict='Skip' and tier='C', regardless of strong firmographic / buyer / signal fit. Disqualifier hits dominate.
- "Pursue" requires real alignment across firmographic fit + active buying signal. "Worth exploring" is the default when data is mixed.
- Treat \`rubric.evidence.<dimension>.<sub_dimension>.strength\` as a confidence weight: \`direct_user_provided\` evidence is the strongest anchor, then \`inferred_from_customer_examples\`, then \`inferred_from_public_data\`, then \`weak_or_unknown\`. When the strength for a sub-dim is \`weak_or_unknown\`, score conservatively (3) and explain in reasoning rather than over-asserting fit.
- reason_to_believe must be a single sentence an AE can paste into their CRM.

SCORE SCALE (every score is an integer 1-5, no decimals, no zeros, no sixes):
- 1 = clear miss / disqualifier hit
- 2 = weak fit on this dimension
- 3 = insufficient signal to judge — neutral default for inclusion sub-fields when research evidence is silent
- 4 = strong fit
- 5 = exemplary, ICP-defining; OR (for disqualifier sub-dims) "no disqualifier defined — no risk"

EMPTY-RUBRIC DEFAULTS (the rule splits by sub-dim type — read carefully, mistakes here are visible to the AE):
- DISQUALIFIER sub-dims (\`disqualifiers.tech_disqualifiers\`, \`disqualifiers.size_disqualifiers\`, \`disqualifiers.stage_disqualifiers\`, \`disqualifiers.behavioral_disqualifiers\`): if the rubric input for that sub-dim is empty, score 5/5 with reasoning "no disqualifier defined — no risk". Empty disqualifier criteria mean there is nothing to flag → max score (no risk).
- ALL OTHER sub-dims (product, buyer, firmographics, technographics, signals): if the rubric input is empty, missing, or "(unknown)", score 3/5 with reasoning "no rubric input — neutral default". Empty INCLUSION criteria mean there is no signal to evaluate → neutral, NEVER 5. A 5/5 here would tell the AE this account is a perfect match for criteria that don't exist.
- In every case: emit the field with a numeric score and reasoning. Do not emit null. Do not omit the field.

LENGTH BUDGETS (one sentence each — bias terse, not exhaustive):
- Per-sub-dim \`reasoning\`: ~180 chars.
- Broad rollup \`reasoning\` (the six top-level fit fields): ~280 chars.
- \`reason_to_believe\`: ≤ 220 chars, single sentence the AE can paste into their CRM.

OUTPUT: Return valid JSON matching the schema. Every broad rollup AND every per-sub-dimension entry listed below MUST be present with both \`score\` and \`reasoning\` fields.

Top-level scorecard (broad rollups, kept for compatibility):
- firmo_fit: industry, employee count, funding stage, geography vs rubric
- techno_fit: required/excluded tools match — if rubric has no tech signals, score 3 and say so
- hiring_signal_fit: how strongly does the current hiring role match signals.hiring_roles
- buyer_fit: seniority + role alignment to rubric.buyer (economic_buyer/champion/end_user)
- proof_point_relevance: does this account look like rubric.proof_points.existing_customers
- disqualifier_risk: 5 = no overlap with disqualifiers; 1 = clear disqualifier match (forces verdict='Skip')

Per-sub-dimension breakdown — score every sub-field below from 1-5 with one line of reasoning. The rubric's structured disqualifiers (tech_disqualifiers, size_disqualifiers, stage_disqualifiers, behavioral_disqualifiers) are scored individually; ANY of them scoring 1/5 means a disqualifier hit.

${renderPromptChecklist({ mode: "full_scoring" })}`;
}

export interface AccountFirmographics {
  company_domain?: string | null;
  funding_stage?: string | null;
  employee_count?: number | null;
  industry?: string | null;
  industry_id?: number | null;
  annual_revenue_usd?: number | null;
  country_code?: string | null;
  hiring_for?: string | null;
  seniority?: string | null;
}

export function buildIcpAccountFitPrompt({
  companyName,
  rubric,
  firmographics,
  research,
}: {
  companyName: string;
  rubric: IcpRubric;
  firmographics: AccountFirmographics;
  research: string;
}): string {
  return `## Target Account

**Company:** ${companyName}
**Domain:** ${firmographics.company_domain ?? "(unknown)"}
**Industry:** ${firmographics.industry ?? "(unknown)"}
**Employees:** ${firmographics.employee_count ?? "(unknown)"}
**Funding stage:** ${firmographics.funding_stage ?? "(unknown)"}
**Country:** ${firmographics.country_code ?? "(unknown)"}
**Annual revenue (USD):** ${firmographics.annual_revenue_usd ?? "(unknown)"}

## Active hiring signal

**Role posted:** ${firmographics.hiring_for ?? "(none)"}
**Seniority:** ${firmographics.seniority ?? "(unknown)"}

## ICP Rubric

\`\`\`json
${JSON.stringify(rubric, null, 2)}
\`\`\`

## Research evidence

${research}

Score the account now: every broad component AND every per-sub-dimension entry must be filled.`;
}
