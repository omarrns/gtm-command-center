import type { SenderIdentity } from "../sender-identity";

export function buildEmailHeadOfGrowthSystem(sender: SenderIdentity): string {
  const companyDescriptor = sender.recentCompany
    ? `${sender.recentCompany}${sender.recentCompanyDescriptor ? ` — ${sender.recentCompanyDescriptor}` : ""}`
    : null;

  const opening = companyDescriptor
    ? `Describe the recent company by its STAGE, not its name. "I just left ${companyDescriptor}, ${sender.recentRole ? sender.recentRole.toLowerCase() : "built the growth infrastructure from zero"}."`
    : `Lead with positioning: "${sender.positioning.split(".")[0]}."`;

  const toolList =
    sender.tools.length > 0
      ? sender.tools.join(", ")
      : "relevant tools from their profile";

  const subjectLine = sender.recentCompany
    ? `If recipient might recognize ${sender.recentCompany}: "${sender.recentCompany} to {Company}?". Otherwise stage-matched alternatives: "Just built this from scratch at a startup" or "{Role} — just did this at ${sender.recentCompanyDescriptor ?? "a startup"}".`
    : `Use a stage-matched subject line: "Just built this from scratch" or "{Role} — builder looking for the next one".`;

  return `You are drafting a cold email from ${sender.fullName} to a Head of Growth, VP Growth, or growth leader at a company where ${sender.firstName} does NOT have domain insider status. Use a stage-matched builder framing instead of domain credibility.

VOICE: ${sender.outreachTone === "formal" ? "Professional, structured, polished." : sender.outreachTone === "direct" ? "Direct, concise, no fluff." : "Casual, direct, internet-native. Confident without performing confidence."} No corporate speak.

KEY DIFFERENCE FROM CEO EMAIL: A Head of Growth needs to know ${sender.firstName} can execute. Bullets are more proof-heavy — include specifics about what was built and outcomes.

STRUCTURE:
1. Opening: ${opening}
2. Context bullets (4 bullets):
   - One stack bullet naming tools wired together (${toolList}) — growth leaders scan for tool familiarity.
   - One automation/AI bullet with specific outcome from the sender's proof points.
   - One personality bullet showing technical depth.
   - One revenue-lens bullet showing business acumen.
3. Bridge (1 sentence): Explicit stage match — "{Company} is at the exact stage I just came from — building foundational growth systems for the first time. That's where I'm strongest."
4. Ask (1-2 sentences, SINGLE CTA): "If this is relevant for the {role} role, I'd love to chat."
5. Sign-off: "${sender.signOff}"

ADAPT: Match stack bullet to the JD's named tools when possible. Match the bridge to their specific stage. If a genuine thematic connection to the sender's thesis exists, add it — but not forced.

SUBJECT LINE: ${subjectLine}

OUTPUT: Return valid JSON with 2 variants:
{
  "variants": [
    { "variant_name": string, "subject": string, "body": string, "reasoning": string }
  ],
  "recommended_variant": 0 | 1
}`;
}

export function buildEmailHeadOfGrowthPrompt({
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
Role being pursued: ${roleTitle ?? "(general growth/ops roles)"}

---

Draft 2 variants of the cold email. Return only the JSON object described in the system prompt.`;
}
