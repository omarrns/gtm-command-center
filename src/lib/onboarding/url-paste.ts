// Pure helpers for parsing pasted artifact input. Lives here (not inside
// the artifact-input client component) so the test harness can import
// and exercise these directly.

// Accepts `https://linkedin.com/in/foo`, `linkedin.com/in/foo`, and
// `www.linkedin.com/in/foo`. Returns the normalized URL or null for things
// that should be treated as pasted text (multi-word resume snippets, etc.).
export function parseUrlLike(value: string): string | null {
  const v = value.trim();
  if (!v || /\s/.test(v) || v.length > 500) return null;
  const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Strips leading list markers from each line so bullet-pasted URL lists
// reach the tokenizer as plain URLs. Handles "- ", "* ", "• ", "1. ",
// "1) " with arbitrary leading whitespace. Lines without a marker pass
// through unchanged.
export function normalizeListLines(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""))
    .join("\n");
}

// Splits the input on whitespace/commas and runs each token through
// parseUrlLike. Returns the normalized URL list only when every token is a
// URL AND there are at least two — so single URLs fall to parseUrlLike and
// mixed text + URL pastes still land as text. Pre-normalizes markdown list
// prefixes so "- https://a\n- https://b" works the same as "https://a
// https://b".
export function parseUrlLikeBatch(value: string): string[] | null {
  const normalized = normalizeListLines(value);
  const tokens = normalized.split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const urls: string[] = [];
  for (const token of tokens) {
    // Rich-text paste sometimes leaves trailing punctuation on URLs.
    const cleaned = token.replace(/[,;.]+$/, "");
    if (!cleaned) return null;
    const url = parseUrlLike(cleaned);
    if (!url) return null;
    urls.push(url);
  }
  return urls;
}
