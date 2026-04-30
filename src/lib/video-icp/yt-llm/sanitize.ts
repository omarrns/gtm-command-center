import type { VideoBundle } from "./schema.js";

const INVISIBLE_RE =
  /[\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{206F}\u{FEFF}\u{E0000}-\u{E007F}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu;
const NEWLINE_RE = /[\r\n]+/g;
const MULTI_SPACE_RE = /\s{2,}/g;

export type SanitizeOptions = {
  /** Strip zero-width and bidi-override Unicode chars from all text fields. Default true. */
  stripInvisibleControls?: boolean;
  /** Collapse newlines in single-line fields (title, channel, uploader, tags, chapter titles). Default true. */
  collapseSingleLineFields?: boolean;
  /** Truncate `meta.description` to this many chars. Default 5000. Set to 0 to disable. */
  maxDescriptionChars?: number;
  /** Truncate `transcript.full` to this many chars. Default 0 (no truncation). */
  maxTranscriptChars?: number;
  /** Cap `meta.tags` length. Default 50. Set to 0 to disable. */
  maxTags?: number;
};

export function sanitizeBundle(
  bundle: VideoBundle,
  options: SanitizeOptions = {},
): VideoBundle {
  const stripInvisible = options.stripInvisibleControls ?? true;
  const collapseLines = options.collapseSingleLineFields ?? true;
  const maxDesc = options.maxDescriptionChars ?? 5000;
  const maxTr = options.maxTranscriptChars ?? 0;
  const maxTags = options.maxTags ?? 50;

  const stripCtrl = (s: string): string =>
    stripInvisible ? s.replace(INVISIBLE_RE, "") : s;
  const oneLine = (s: string): string => {
    const cleaned = stripCtrl(s);
    return collapseLines
      ? cleaned.replace(NEWLINE_RE, " ").replace(MULTI_SPACE_RE, " ").trim()
      : cleaned;
  };
  const truncate = (s: string, max: number): string =>
    max > 0 && s.length > max ? `${s.slice(0, max)}…` : s;

  const tagsCapped =
    maxTags > 0 && bundle.meta.tags.length > maxTags
      ? bundle.meta.tags.slice(0, maxTags)
      : bundle.meta.tags;

  return {
    ...bundle,
    meta: {
      ...bundle.meta,
      title: oneLine(bundle.meta.title),
      channel: oneLine(bundle.meta.channel),
      uploader:
        bundle.meta.uploader === null ? null : oneLine(bundle.meta.uploader),
      description: truncate(stripCtrl(bundle.meta.description), maxDesc),
      tags: tagsCapped.map((t) => oneLine(t)),
    },
    chapters: bundle.chapters.map((c) => ({
      ...c,
      title: oneLine(c.title),
    })),
    transcript: bundle.transcript
      ? {
          ...bundle.transcript,
          full: truncate(stripCtrl(bundle.transcript.full), maxTr),
          paragraphs: bundle.transcript.paragraphs.map((p) => ({
            ...p,
            text: stripCtrl(p.text),
          })),
          segments: bundle.transcript.segments.map((s) => ({
            ...s,
            text: stripCtrl(s.text),
          })),
        }
      : null,
    // `bundle.comments` is tri-state (absent / null / array). Preserve "absent"
    // so sanitize doesn't accidentally upgrade a v0.1-shaped bundle to v0.2's
    // `comments: null` shape. Commenter-controlled text gets the same
    // invisible-char strip as title / description.
    ...(bundle.comments !== undefined
      ? {
          comments: bundle.comments
            ? bundle.comments.map((c) => ({
                ...c,
                text: stripCtrl(c.text),
                author: oneLine(c.author),
              }))
            : null,
        }
      : {}),
  };
}
