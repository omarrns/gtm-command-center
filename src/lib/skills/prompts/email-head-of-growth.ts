export const EMAIL_HEAD_OF_GROWTH_SYSTEM = `You are drafting a cold email from Omar Nasser to a Head of Growth, VP Growth, or growth leader at a company where Omar does NOT have domain insider status. Use a stage-matched builder framing instead of domain credibility.

VOICE: Casual, direct, internet-native. Confident without performing confidence. No corporate speak.

KEY DIFFERENCE FROM CEO EMAIL: A Head of Growth needs to know Omar can execute. Bullets are more proof-heavy — include specifics about what was built and outcomes.

STRUCTURE:
1. Opening: Describe Inkeep by its STAGE, not its name. "I just left Inkeep — enterprise AI startup, ~40 people, built the entire growth infrastructure from zero."
2. Context bullets (4 bullets):
   - One stack bullet naming the tools Omar wired together (HubSpot, Apollo, Salesforce, PostHog, Gong, Sendgrid…) — growth leaders scan for tool familiarity.
   - One automation/AI bullet with specific outcome (Claude SDK + n8n + Exa + Firecrawl → 2+ enterprise demos/week).
   - One personality bullet ("AI-pilled (like a lot) — I build production systems, not configure tools off the shelf.").
   - One revenue-lens bullet ("Former AE, so I think about ops from the 'does this actually help close a deal' side.").
3. Bridge (1 sentence): Explicit stage match — "{Company} is at the exact stage I just came from — building foundational growth systems for the first time. That's where I'm strongest."
4. Ask (1-2 sentences, SINGLE CTA): "If this is relevant for the {role} role, I'd love to chat."
5. Sign-off: "Best," + "Omar"

ADAPT: Match stack bullet to the JD's named tools when possible. Match the bridge to their specific stage. If a genuine thematic connection to Omar's thesis exists, add it — but not forced.

SUBJECT LINE: If recipient might recognize Inkeep (AI/tech/devtools): "Inkeep to {Company}?". Otherwise stage-matched alternatives: "Just built this from scratch at an AI startup" or "{Role} — just did this at {Inkeep descriptor}".

OUTPUT: Return valid JSON with 2 variants:
{
  "variants": [
    { "variant_name": string, "subject": string, "body": string, "reasoning": string }
  ],
  "recommended_variant": 0 | 1
}`;

export function buildEmailHeadOfGrowthPrompt({
  companyName,
  recipientName,
  recipientTitle,
  roleTitle,
  analysisContext,
  omarProfile,
  outreachStyle,
}: {
  companyName: string;
  recipientName: string;
  recipientTitle: string;
  roleTitle?: string;
  analysisContext?: string;
  omarProfile: string;
  outreachStyle: string;
}) {
  return `## Omar's Profile

${omarProfile}

## Omar's Outreach Style

${outreachStyle}

${analysisContext ? `## Prior Analysis of ${companyName}\n\n${analysisContext}\n\n` : ""}

## Recipient

Name: ${recipientName}
Title: ${recipientTitle}
Company: ${companyName}
Role Omar is reaching out about: ${roleTitle ?? "(general growth/ops roles)"}

---

Draft 2 variants of the cold email. Return only the JSON object described in the system prompt.`;
}
