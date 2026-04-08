import type { SenderIdentity } from "../sender-identity";

export function buildJdFitRubricSystem(sender: SenderIdentity): string {
  const recentExp = sender.recentCompany
    ? ` Weight recent ${sender.recentCompany} experience heavily.`
    : "";

  return `You are scoring a job description against ${sender.fullName}'s resume to determine qualification strength. The goal is an honest answer: "Am I actually qualified for this role, and how should I position my application?"

This is a requirement-by-requirement match exercise. Every claim must be backed by evidence from the resume and memory context.

PRINCIPLES:
- Be honest about gaps. Be candid about qualification shortfalls.${recentExp}
- PARTIAL MATCH (adjacent experience that transfers) is not a GAP.
- Specificity > vagueness. Every match must cite a specific project or bullet.

OUTPUT FORMAT: Return valid JSON only, matching this schema exactly:
{
  "role_title": string,
  "company_name": string,
  "scorecard": {
    "years_seniority": { "score": 1-5, "justification": string },
    "core_responsibilities": { "score": 1-5, "justification": string },
    "technical_requirements": { "score": 1-5, "justification": string },
    "industry_domain": { "score": 1-5, "justification": string },
    "outcome_evidence": { "score": 1-5, "justification": string },
    "soft_skills": { "score": 1-5, "justification": string },
    "gap_risk": { "score": 1-5, "justification": string }
  },
  "total_score": number (0-35),
  "verdict": "Strong match" | "Solid match" | "Stretch" | "Weak match",
  "requirement_matches": [
    { "requirement": string, "status": "STRONG MATCH" | "PARTIAL MATCH" | "GAP", "evidence": string, "notes": string }
  ],
  "flags": {
    "reporting_structure": { "rating": "green"|"orange"|"red", "note": string },
    "builder_vs_executor": { "rating": "green"|"orange"|"red", "note": string },
    "scope_clarity": { "rating": "green"|"orange"|"red", "note": string },
    "company_filter": { "rating": "green"|"orange"|"red", "note": string }
  },
  "positioning_recommendations": [ string, string, string ],
  "bottom_line": string
}

Scoring bands:
- 28-35: Strong match (apply with confidence)
- 21-27: Solid match (apply, position well)
- 14-20: Stretch (real gaps, only with strong reason)
- 0-13: Weak match (probably skip)`;
}

export function buildJdFitRubricPrompt({
  jobDescription,
  companyName,
  roleTitle,
  memory,
}: {
  jobDescription: string;
  companyName?: string;
  roleTitle?: string;
  memory: string;
}) {
  return `## Candidate Memory Context

${memory}

## Job Description

Company: ${companyName ?? "(unknown \u2014 infer from JD)"}
Role: ${roleTitle ?? "(unknown \u2014 infer from JD)"}

${jobDescription}

---

Score this JD against the candidate's background. Return only the JSON object described in the system prompt.`;
}
