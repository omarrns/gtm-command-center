import type { SenderIdentity } from "../sender-identity";

export function buildEmailB2bCustomerSupportSystem(
  sender: SenderIdentity,
): string {
  const companyTransition = sender.recentCompany
    ? `Lead with domain insider claim. "{Name}, I just left ${sender.recentCompany}, so I've been ${sender.domainInsiderClaim}."`
    : `Lead with positioning: "${sender.positioning.split(".")[0]}."`;

  const subjectLine = sender.recentCompany
    ? `Prefer "${sender.recentCompany} to {Company}?" format (proven reply-rate driver in CEO outreach).`
    : `Use a positioning-led subject line that signals relevance to the recipient's market.`;

  return `You are drafting a cold email from ${sender.fullName} to a CEO/founder at a B2B customer support or customer operations company.${sender.recentCompany ? ` ${sender.firstName}'s edge is domain insider credibility — recently at ${sender.recentCompany}${sender.recentCompanyDescriptor ? ` (${sender.recentCompanyDescriptor})` : ""}, same market.` : ""}

VOICE: ${sender.outreachTone === "formal" ? "Professional, structured, polished." : sender.outreachTone === "direct" ? "Direct, concise, no fluff." : "Casual, direct, internet-native. Confident without performing confidence. Human."} No "I hope this email finds you well", no clever bold headers, no mirror-backs of the CEO's own stats.

DO NOT:
- Mirror the CEO's own stats/quotes at them (reads as tryhard)
- Give a menu of options in the ask
- Use bold headers on every bullet
- Over-explain — parentheticals are enough
- Exceed ~120 words in the body

STRUCTURE:
1. Opening (1-2 sentences): ${companyTransition}
2. Quick context bullets (3-4 bullets, 1-2 sentences each): highlight proof points, technical depth, sales acumen, buyer familiarity. Not a resume.
3. Bridge (1 sentence): connect ${sender.firstName}'s background to the role.
4. Ask (1-2 sentences, SINGLE CTA): one ask only, no hedging.
5. Sign-off: "${sender.signOff}"

SUBJECT LINE: ${subjectLine}

OUTPUT: Return valid JSON with 2 variants:
{
  "variants": [
    {
      "variant_name": string,
      "subject": string,
      "body": string,
      "reasoning": string
    }
  ],
  "recommended_variant": 0 | 1
}`;
}

export function buildEmailB2bCustomerSupportPrompt({
  companyName,
  recipientName,
  recipientTitle,
  roleTitle,
  analysisContext,
  senderProfile,
  outreachStyle,
}: {
  companyName: string;
  recipientName: string;
  recipientTitle: string;
  roleTitle?: string;
  analysisContext?: string;
  senderProfile: string;
  outreachStyle: string;
}) {
  return `## Sender Profile

${senderProfile}

## Sender Outreach Style

${outreachStyle}

${analysisContext ? `## Prior Analysis of ${companyName}\n\n${analysisContext}\n\n` : ""}

## Recipient

Name: ${recipientName}
Title: ${recipientTitle}
Company: ${companyName}
Role being pursued: ${roleTitle ?? "(general GTM/growth roles)"}

---

Draft 2 variants of the cold email. Return only the JSON object described in the system prompt.`;
}
