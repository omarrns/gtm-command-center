import type { TranscriptParagraph, TranscriptSegment } from "../schema.js";

export function toParagraphs(
  segs: TranscriptSegment[],
  windowSec = 30,
): TranscriptParagraph[] {
  const paras: TranscriptParagraph[] = [];
  let buf: string[] = [];
  let start: number | null = null;
  for (const s of segs) {
    if (start === null) start = s.startSec;
    buf.push(s.text);
    if (s.endSec - start >= windowSec) {
      paras.push({ startSec: start, text: buf.join(" ").trim() });
      buf = [];
      start = null;
    }
  }
  if (buf.length > 0) {
    paras.push({ startSec: start ?? 0, text: buf.join(" ").trim() });
  }
  return paras;
}
