import { z } from "zod";
import type { SenderIdentity } from "../sender-identity";

export const icpAccountDraftOutputSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  reasoning: z.string(),
});

export type IcpAccountDraftOutput = z.infer<
  typeof icpAccountDraftOutputSchema
>;

interface IcpAccountOutreachPromptInput {
  companyName: string;
  companyDomain: string | null;
  persona: {
    name: string;
    title: string;
    description: string;
  };
  narrativeArcMarkdown: string;
  rubricBuyer: unknown;
  senderProfile: string;
  outreachStyle: string;
  accountSignals: unknown;
  extraContext?: string;
  recentResearch?: string;
}

export function buildIcpAccountOutreachSystem(
  sender: SenderIdentity,
): string {
  const voice =
    sender.outreachTone === "formal"
      ? "Professional, precise, and executive-readable."
      : sender.outreachTone === "direct"
        ? "Direct, concise, and specific."
        : "Casual, direct, and human. Confident without sounding polished by committee.";

  return `You are drafting a cold email from ${sender.fullName} to a buyer at a target account.

VOICE: ${voice}

SELLER CONTEXT:
- Sender positioning: ${sender.positioning}
- Proof points: ${sender.proofPoints.length ? sender.proofPoints.join("; ") : "(use sender profile context)"}
- Sign-off: "${sender.signOff}"

GROUNDING RULES:
- Treat the ICP Narrative Arc as canonical buyer language.
- The opener should echo a Trigger-shaped phrase from the buyer's world.
- The body should reference a Stakes-shaped concern without sounding alarmist.
- Paraphrase the arc; do not paste long phrases verbatim.
- Use the account signal only when it strengthens the buyer-pain angle.

DO NOT:
- Use job-seeker framing such as "applying", "interested in roles", or "left my last company".
- Write marketing slogans, generic value props, or a product brochure.
- Claim personal familiarity with the buyer or company unless evidence is provided.
- Exceed 120 words in the body.
- Use more than one CTA.

STRUCTURE:
1. Opening: trigger-aware observation about the buyer's current world.
2. Bridge: connect the pain to ${sender.firstName}'s relevant proof or positioning.
3. Stakes: name the business consequence in plain language.
4. CTA: one low-friction ask.
5. Sign-off: "${sender.signOff}"

OUTPUT: Return valid JSON:
{ "subject": string, "body": string, "reasoning": string }`;
}

export function buildIcpAccountOutreachPrompt({
  companyName,
  companyDomain,
  persona,
  narrativeArcMarkdown,
  rubricBuyer,
  senderProfile,
  outreachStyle,
  accountSignals,
  extraContext,
  recentResearch,
}: IcpAccountOutreachPromptInput): string {
  return `## ICP Narrative Arc

${narrativeArcMarkdown}

## ICP Rubric Buyer Definitions

${JSON.stringify(rubricBuyer, null, 2)}

## Sender Profile

${senderProfile || "(not provided)"}

## Sender Outreach Style

${outreachStyle || "(not provided)"}

## Target Account

Company: ${companyName}
Domain: ${companyDomain ?? "unknown"}
Primary signal:
${JSON.stringify(accountSignals ?? null, null, 2)}

## Buyer Persona

Name: ${persona.name}
Title: ${persona.title || "unknown"}
Description: ${persona.description || "(not provided)"}

${recentResearch ? `## Recent Research\n\n${recentResearch}\n\n` : ""}${extraContext ? `## Extra Context\n\n${extraContext}\n\n` : ""}---

Draft the strongest story-grounded cold email for this buyer. Return only the JSON object described in the system prompt.`;
}
