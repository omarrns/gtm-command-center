/**
 * Canonical markdown helpers for reading onboarding memory docs.
 *
 * Memory docs are written with `## Heading` sections, optionally separated by
 * `---` horizontal rules. Section extraction stops at the next heading or rule,
 * whichever comes first — this matches how `sender-identity` and
 * `scoring-profile` already read profile/dealbreaker docs, and is stricter
 * than the old onboard-client/review-helpers variant (which only stopped at
 * `---` or EOF).
 */

export type OutreachTone = "casual" | "direct" | "formal";

/**
 * Return the body text beneath a `## Heading` in a markdown doc, up to the
 * next `## ` heading, `\n---\n` rule, or EOF — whichever comes first.
 * Returns empty string when content is null/empty or the heading is absent.
 */
export function extractSection(
  content: string | null | undefined,
  heading: string,
): string {
  if (!content) return "";
  const pattern = new RegExp(
    `## ${heading}\\s*\\n\\n([\\s\\S]*?)(?=\\n## |\\n---\\n|$)`,
  );
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? "";
}

/**
 * Infer outreach tone from an existing outreach memory doc by substring
 * match on rendered tone labels ("Direct", "Formal", "Casual"). Returns null
 * when no label is found — callers choose the default (usually "casual").
 *
 * Order matters: check "Direct" and "Formal" before "Casual" because generic
 * prose could contain the word "casual" without labeling a tone.
 */
export function extractTone(
  content: string | null | undefined,
): OutreachTone | null {
  if (!content) return null;
  if (content.includes("Direct")) return "direct";
  if (content.includes("Formal")) return "formal";
  if (content.includes("Casual")) return "casual";
  return null;
}
