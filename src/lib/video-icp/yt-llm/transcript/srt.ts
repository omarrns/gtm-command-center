import type { TranscriptSegment } from "../schema.js";

export function parseSrtTime(t: string): number {
  const cleaned = t.replace(",", ".").trim();
  const parts = cleaned.split(":");
  if (parts.length !== 3) throw new Error(`bad time: ${t}`);
  const [h, m, rest] = parts as [string, string, string];
  const [s, ms = "0"] = rest.split(".");
  return (
    Number(h) * 3600 +
    Number(m) * 60 +
    Number(s) +
    Number((ms ?? "0").slice(0, 3).padEnd(3, "0")) / 1000
  );
}

const TAG_RE = /<[^>]+>/g;
const BLOCK_RE = /\r?\n\r?\n/;

export function parseSrt(text: string): TranscriptSegment[] {
  const stripped = text.replace(TAG_RE, "");
  const segs: TranscriptSegment[] = [];
  for (const block of stripped.trim().split(BLOCK_RE)) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const timeline = lines.find((l) => l.includes("-->"));
    if (!timeline) continue;
    const [a, b] = timeline.split("-->");
    if (!a || !b) continue;
    let startSec: number, endSec: number;
    try {
      startSec = parseSrtTime(a);
      endSec = parseSrtTime(b);
    } catch {
      continue;
    }
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    const body = lines
      .filter((l) => !l.includes("-->") && !/^\d+$/.test(l))
      .join(" ")
      .trim();
    if (body) segs.push({ startSec, endSec, text: body });
  }
  return segs;
}
