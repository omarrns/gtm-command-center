/**
 * Helpers for extracting fallback values from existing markdown-formatted
 * memory docs when the interview did not cover a topic.
 */

export type OutreachTone = "casual" | "direct" | "formal";

/**
 * Pull the body text beneath a `## Heading` in a markdown doc, up to the
 * next `\n---\n` separator or EOF. Returns empty string if not found.
 *
 * Used during refresh-mode onboarding: if the interview did not cover a
 * topic (e.g. search_prefs), the existing memory doc's sections provide
 * fallback values so we don't clobber saved data with extractor defaults.
 */
export function extractSectionFromMarkdown(
  content: string | null | undefined,
  heading: string,
): string {
  if (!content) return "";
  const regex = new RegExp(
    `## ${heading}\\s*\\n\\n([\\s\\S]*?)(?=\\n---\\n|$)`,
  );
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

/**
 * Infer the outreach tone from an existing outreach memory doc by looking
 * for rendered label text. The onboarding wizard writes sections titled
 * "Tone: Direct", "Tone: Formal", etc., so substring matching on those
 * labels is sufficient here. Order matters: check "Direct" before
 * "Casual" because "Casual" could theoretically appear in prose.
 */
export function inferToneFromMarkdown(
  content: string | null | undefined,
): OutreachTone | null {
  if (!content) return null;
  if (content.includes("Direct")) return "direct";
  if (content.includes("Formal")) return "formal";
  if (content.includes("Casual")) return "casual";
  return null;
}
