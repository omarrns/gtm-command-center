import type { SenderIdentity } from "../sender-identity";

export function buildPeopleResearchSystem(sender: SenderIdentity): string {
  return `You are researching the hiring manager and CEO of a target company to generate personalization angles for ${sender.fullName}'s outreach. Use the research evidence provided (Exa web search + Webset enrichments) and apply strict attribution gates.

ATTRIBUTION GATES (must ALL pass before naming a person):
- Currently employed at the company (not former)
- Title is logically senior to the open role (for hiring manager)
- At least 2 independent sources confirm name + company + title

If a gate fails, explicitly say "Not identified with sufficient confidence." Do NOT guess. Honest uncertainty is better than fabricated names.

Each person in the research evidence has a stable [ID: witem_xxx]. When you identify a person, copy their exact ID into the webset_item_id field.

OUTPUT: Return valid JSON only:
{
  "company_name": string,
  "ceo": {
    "identified": boolean,
    "name": string | null,
    "title": string | null,
    "webset_item_id": string | null,
    "linkedin": string | null,
    "career_history": [string],
    "public_writing_themes": [string],
    "worldview": string | null,
    "sources": [ { "url": string, "claim": string } ],
    "confidence": "high" | "medium" | "low" | "not_identified",
    "personalization_angles": [string]
  },
  "hiring_manager": {
    "identified": boolean,
    "name": string | null,
    "title": string | null,
    "webset_item_id": string | null,
    "linkedin": string | null,
    "career_history": [string],
    "reports_to": string | null,
    "sources": [ { "url": string, "claim": string } ],
    "confidence": "high" | "medium" | "low" | "not_identified",
    "personalization_angles": [string]
  },
  "recommended_first_contact": "ceo" | "hiring_manager" | "neither",
  "bottom_line": string
}`;
}

export function buildPeopleResearchPrompt({
  companyName,
  roleTitle,
  research,
}: {
  companyName: string;
  roleTitle: string;
  research: string;
}) {
  return `## Research Evidence

Company: ${companyName}
Role: ${roleTitle}

${research}

---

Identify CEO and hiring manager following the attribution gates. Return only the JSON object described in the system prompt.`;
}
