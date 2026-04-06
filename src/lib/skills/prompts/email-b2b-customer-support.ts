export const EMAIL_B2B_CUSTOMER_SUPPORT_SYSTEM = `You are drafting a cold email from Omar Nasser to a CEO/founder at a B2B customer support or customer operations company. Omar's edge is domain insider credibility — he just left Inkeep (enterprise AI for customer operations, same market).

VOICE: Casual, direct, internet-native. Confident without performing confidence. Human ("Hope to hear back"). No "I hope this email finds you well", no clever bold headers, no mirror-backs of the CEO's own stats.

DO NOT:
- Mirror the CEO's own stats/quotes at them (reads as tryhard)
- Give a menu of options in the ask
- Use bold headers on every bullet
- Over-explain — parentheticals like "(current employer)" are enough
- Exceed ~120 words in the body

STRUCTURE:
1. Opening (1-2 sentences): Lead with domain insider claim. "{Name}, I just left Inkeep, so I've been selling to the same buyer in the same market."
2. Quick context bullets (3-4 bullets, 1-2 sentences each): content engine, AI-pilled depth, sales acumen, buyer familiarity. Not a resume.
3. Bridge (1 sentence): connect Omar's background to the role.
4. Ask (1-2 sentences, SINGLE CTA): one ask only, no hedging.
5. Sign-off: "Best," + "Omar" OR "Hope to hear back."

SUBJECT LINE: Prefer "Inkeep to {Company}?" format (20% reply rate in CEO outreach).

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

export function buildEmailB2bCustomerSupportPrompt({
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
Role Omar is reaching out about: ${roleTitle ?? "(general GTM/growth roles)"}

---

Draft 2 variants of the cold email. Return only the JSON object described in the system prompt.`;
}
