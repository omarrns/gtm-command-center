import type { SenderIdentity } from "../sender-identity";

export function buildCompanyFitAnalyzerSystem(sender: SenderIdentity): string {
  return `You are evaluating strategic fit between ${sender.fullName} and a target company \u2014 WITHOUT a specific JD. Assess whether this company is worth pursuing given the candidate's positioning, thesis, and deal-breakers.

Use the research evidence provided (company overview, GTM motion, funding, founder profile, recent news) plus the candidate's memory context to produce a structured fit assessment.

PRINCIPLES:
- Ground every claim in the research evidence. Do not hallucinate company details.
- Check the candidate's green/red/orange flags from their dealbreakers.
- Identify the strongest outreach angle based on genuine overlap, not forced connections.

OUTPUT: Return valid JSON only:
{
  "company_name": string,
  "one_liner": string,
  "what_they_do": string,
  "stage_and_funding": string,
  "gtm_motion": string,
  "market_position": string,
  "recent_signals": [string],
  "founder_profile": { "name": string, "background": string, "worldview": string },
  "strategic_fit": {
    "market_familiarity": { "score": 1-5, "justification": string },
    "product_adjacency": { "score": 1-5, "justification": string },
    "gtm_motion_match": { "score": 1-5, "justification": string },
    "ai_technical_edge": { "score": 1-5, "justification": string },
    "founder_alignment": { "score": 1-5, "justification": string },
    "stage_match": { "score": 1-5, "justification": string }
  },
  "total_fit_score": number (0-30),
  "verdict": "Pursue" | "Worth exploring" | "Skip",
  "green_flags": [string],
  "red_flags": [string],
  "outreach_angles": [ { "angle": string, "reasoning": string } ],
  "bottom_line": string
}`;
}

export function buildCompanyFitAnalyzerPrompt({
  companyName,
  research,
  memory,
}: {
  companyName: string;
  research: string;
  memory: string;
}) {
  return `## Candidate Memory Context

${memory}

## Research Evidence on ${companyName}

${research}

---

Produce a company fit assessment for ${companyName}. Return only the JSON object described in the system prompt.`;
}
