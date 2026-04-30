export { parseSrt, parseSrtTime } from "./srt.js";
export { dedupeSegments } from "./dedupe.js";
export { toParagraphs } from "./paragraphs.js";

const SRT_RE = /^raw\.([^.]+)\.srt$/;

/**
 * Pick the preferred SRT from yt-dlp's output, using the user-supplied
 * `subLangs` order to break ties. For each subLang (in order):
 *   1. Prefer the plain `raw.<base>.srt` (where base is `subLang` with any
 *      trailing `.*` wildcard stripped).
 *   2. Otherwise, prefer the alphabetically-first `raw.<base>-*.srt`
 *      (locale variants like `en-orig`, `en-US`).
 * Falls back to alphabetical first if nothing matches.
 */
export function pickPreferredSrt(
  filenames: string[],
  subLangs: readonly string[] = ["en.*"],
): string | null {
  if (filenames.length === 0) return null;
  const sorted = [...filenames].sort();

  for (const subLang of subLangs) {
    const base = subLang.replace(/\.\*$/, "");
    const plain = sorted.find((f) => basename(f) === `raw.${base}.srt`);
    if (plain) return plain;
    const variant = sorted.find((f) => {
      const lang = languageFromSrtName(f);
      return lang === base || lang.startsWith(`${base}-`);
    });
    if (variant) return variant;
  }
  return sorted[0] ?? null;
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx === -1 ? p : p.slice(idx + 1);
}

export function languageFromSrtName(filename: string): string {
  const name = basename(filename);
  const m = name.match(SRT_RE);
  return m?.[1] ?? "unknown";
}
