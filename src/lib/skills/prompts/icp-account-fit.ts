/**
 * Prompt builder — ICP account fit scoring.
 *
 * Consumed by `scoreAccountAgainstIcp`. Output is a 6-dimension scorecard
 * plus verdict/tier/reason_to_believe. The prompt is intentionally blunt
 * — this scores whether to pursue, not how to position.
 */

import type { SenderIdentity } from "../sender-identity";

export function buildIcpAccountFitSystem(sender: SenderIdentity): string {
  return `You are scoring a target account against ${sender.fullName}'s ICP rubric for outbound GTM work.

Job: tell the AE in one line whether this account is worth pursuing, and why. Be honest — we are scoring fit, not pitching the company. Low scores are fine; false positives waste quota, false negatives are recoverable by running the pipeline again tomorrow.

PRINCIPLES:
- Ground every score in the rubric + evidence provided. No speculation.
- If firmographics clearly disqualify the account (e.g. 50x too big, wrong geo), return tier='C' and verdict='Skip' regardless of other signals.
- "Pursue" requires real alignment across firmographic fit + active buying signal. "Worth exploring" is the default when data is mixed.
- reason_to_believe must be a single sentence an AE can paste into their CRM.

OUTPUT: Return valid JSON with the full 6-dimension scorecard:
{
  "company_name": string,
  "firmo_fit":            {"score": 1-5, "reasoning": string},
  "techno_fit":           {"score": 1-5, "reasoning": string},
  "hiring_signal_fit":    {"score": 1-5, "reasoning": string},
  "buyer_fit":            {"score": 1-5, "reasoning": string},
  "proof_point_relevance":{"score": 1-5, "reasoning": string},
  "disqualifier_risk":    {"score": 1-5, "reasoning": string},
  "verdict": "Pursue" | "Worth exploring" | "Skip",
  "tier": "A" | "B" | "C",
  "reason_to_believe": string
}

Scoring anchors:
- firmo_fit: industry, employee count, funding stage, geography vs rubric
- techno_fit: required/excluded tools match — if rubric has no tech signals, score 3 and say so
- hiring_signal_fit: how strongly does the current hiring role match signals.hiring_roles
- buyer_fit: seniority + role alignment to rubric.buyer (economic_buyer/champion/end_user)
- proof_point_relevance: does this account look like rubric.proof_points.existing_customers
- disqualifier_risk: 5 = no overlap with disqualifiers; 1 = clear disqualifier match`;
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
  rubric: unknown;
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

Score the account now.`;
}
