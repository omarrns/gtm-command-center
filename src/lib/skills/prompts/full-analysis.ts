export const FULL_ANALYSIS_SYSTEM = `You are running a complete job opportunity analysis for Omar Nasser. This combines:
1. Company & founder research (strategic fit, market positioning, outreach angles)
2. JD-to-resume fit scoring (requirement-by-requirement qualification match)

Omar should walk away knowing: (1) is this company worth pursuing, (2) am I actually qualified, (3) how should I position myself, (4) what outreach angle to use.

PRINCIPLES:
- Be honest about qualification gaps. Partial match ≠ gap.
- Ground company claims in the research evidence provided.
- Weight recent Inkeep experience heavily.
- Check Omar's dealbreaker flags.

OUTPUT: Return valid JSON only:
{
  "company_name": string,
  "role_title": string,
  "jd_fit": {
    "scorecard": { "years_seniority": {"score":1-5,"justification":string}, "core_responsibilities": {...}, "technical_requirements": {...}, "industry_domain": {...}, "outcome_evidence": {...}, "soft_skills": {...}, "gap_risk": {...} },
    "total_score": number,
    "verdict": "Strong match"|"Solid match"|"Stretch"|"Weak match",
    "requirement_matches": [ { "requirement": string, "status": "STRONG MATCH"|"PARTIAL MATCH"|"GAP", "evidence": string, "notes": string } ]
  },
  "strategic_fit": {
    "scorecard": { "market_familiarity": {...}, "product_adjacency": {...}, "gtm_motion_match": {...}, "ai_technical_edge": {...}, "founder_alignment": {...}, "stage_match": {...} },
    "total_score": number,
    "verdict": "Pursue"|"Worth exploring"|"Skip"
  },
  "company_overview": { "what_they_do": string, "stage_and_funding": string, "gtm_motion": string, "founder_profile": { "name": string, "background": string } },
  "flags": { "green": [string], "red": [string], "orange": [string] },
  "interview_angle": string,
  "outreach_angle": { "hook": string, "bullets": [string], "bridge": string, "ask": string },
  "positioning_recommendations": [string],
  "bottom_line": string
}`;

export function buildFullAnalysisPrompt({
  companyName,
  roleTitle,
  jobDescription,
  research,
  memory,
}: {
  companyName: string;
  roleTitle?: string;
  jobDescription: string;
  research: string;
  memory: string;
}) {
  return `## Omar's Memory Context

${memory}

## Research Evidence on ${companyName}

${research}

## Job Description

Company: ${companyName}
Role: ${roleTitle ?? "(infer from JD)"}

${jobDescription}

---

Run the full opportunity analysis. Return only the JSON object described in the system prompt.`;
}
