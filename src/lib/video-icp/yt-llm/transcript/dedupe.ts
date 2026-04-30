import type { TranscriptSegment } from "../schema.js";

export function dedupeSegments(segs: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let last: string[] = [];
  for (const s of segs) {
    const words = s.text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) continue;
    let i = 0;
    for (let k = Math.min(last.length, words.length); k > 0; k--) {
      if (arraysEqual(last.slice(-k), words.slice(0, k))) {
        i = k;
        break;
      }
    }
    const fresh = words.slice(i);
    if (fresh.length > 0) {
      out.push({
        startSec: s.startSec,
        endSec: s.endSec,
        text: fresh.join(" "),
      });
    }
    last = words;
  }
  return out;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
