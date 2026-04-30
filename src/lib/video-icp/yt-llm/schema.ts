import { z } from "zod";

export const ChapterSchema = z.object({
  startSec: z.number(),
  title: z.string(),
});

export const TranscriptSegmentSchema = z.object({
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
});

export const TranscriptParagraphSchema = z.object({
  startSec: z.number(),
  text: z.string(),
});

export const TranscriptSourceSchema = z.enum([
  "captions",
  "whisper",
  "deepgram",
  "openai",
]);

export const TranscriptSchema = z.object({
  source: TranscriptSourceSchema,
  sourceDetail: z.string().nullable(),
  /**
   * Language tag parsed from the SRT filename emitted by yt-dlp (e.g. `en`,
   * `en-orig`, `en-en`, `ar`). NOT normalized to BCP-47 — the value can include
   * yt-dlp suffixes like `-orig` (auto-translated source) or `-en` (auto-dubbed
   * target). Consumers filtering by language should match prefix, not exact
   * equality (`lang.startsWith("en")` rather than `lang === "en"`).
   */
  language: z.string(),
  full: z.string(),
  segments: z.array(TranscriptSegmentSchema),
  paragraphs: z.array(TranscriptParagraphSchema),
});

export const VideoMetaSchema = z.object({
  title: z.string(),
  channel: z.string(),
  channelId: z.string().nullable(),
  channelUrl: z.string().nullable(),
  uploader: z.string().nullable(),
  uploadedAt: z.string().nullable(),
  durationSec: z.number(),
  durationString: z.string().nullable(),
  views: z.number().nullable(),
  likeCount: z.number().nullable(),
  commentCount: z.number().nullable(),
  description: z.string(),
  tags: z.array(z.string()),
  categories: z.array(z.string()),
  thumbnailUrl: z.string().nullable(),
  isLive: z.boolean(),
  wasLive: z.boolean(),
  liveStatus: z.string().nullable(),
  ageLimit: z.number(),
  availability: z.string().nullable(),
});

export const CommentSchema = z.object({
  id: z.string(),
  /** "root" for top-level comments, otherwise the parent comment id (yt-dlp's `parent` field). */
  parentId: z.string(),
  text: z.string(),
  author: z.string(),
  /** Channel id of the commenter — load-bearing for downstream commenter enrichment / ICP matching. */
  authorId: z.string().nullable(),
  authorIsUploader: z.boolean(),
  authorIsVerified: z.boolean(),
  isPinned: z.boolean(),
  /** True if the comment was hearted by the creator. */
  isFavorited: z.boolean(),
  likeCount: z.number().nullable(),
  /** Unix epoch seconds; null when yt-dlp can't extract one. */
  timestampSec: z.number().nullable(),
});

export const VideoSourceSchema = z.object({
  url: z.string(),
  // Constrained to filename-safe chars so it can't escape an outputDir
  // when used as a path segment by writeBundle. Canonical YouTube IDs
  // are 11 chars; the upper bound is generous for non-YouTube extractors.
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, "id must match /^[A-Za-z0-9_-]+$/"),
  platform: z.literal("youtube"),
});

export const VideoBundleSchema = z.object({
  source: VideoSourceSchema,
  meta: VideoMetaSchema,
  chapters: z.array(ChapterSchema),
  transcript: TranscriptSchema.nullable(),
  /**
   * Tri-state by design — kept fully optional so old-shaped bundles (and
   * default `--json` output when comments aren't requested) stay parseable
   * and byte-identical to v0.1.3:
   *   - field absent: caller didn't opt in (`withComments` not set)
   *   - `null`: caller opted in but the comment fetch failed (look for
   *     `kind: "comments"` in `result.errors`)
   *   - `[]`: caller opted in, fetch succeeded, video has no comments
   *   - `Comment[]`: comments fetched and validated
   */
  comments: z.array(CommentSchema).nullable().optional(),
});

export type Chapter = z.infer<typeof ChapterSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type TranscriptParagraph = z.infer<typeof TranscriptParagraphSchema>;
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;
export type VideoMeta = z.infer<typeof VideoMetaSchema>;
export type VideoSource = z.infer<typeof VideoSourceSchema>;
export type VideoBundle = z.infer<typeof VideoBundleSchema>;
export type Comment = z.infer<typeof CommentSchema>;

export type AnalyzeErrorKind = "playlist" | "video" | "transcript" | "comments";
export type AnalyzeError = {
  id: string;
  reason: string;
  /** Optional discriminant: "playlist" = top-level URL/enumeration failure, "video" = per-video failure, "transcript" = caption fetch failed for a video that otherwise succeeded, "comments" = comment fetch failed but the metadata + transcript bundle still shipped (`bundle.comments` is `null`). */
  kind?: AnalyzeErrorKind;
};
export type AnalyzeResult = {
  bundles: VideoBundle[];
  errors: AnalyzeError[];
  /**
   * Raw, unfiltered yt-dlp info per video id. Loosely typed to keep the public
   * surface clean — used by `writeBundle()` to emit `raw.info.json` for parity
   * with the Python script. Duplicate ids in a playlist (re-uploaded shorts,
   * curated lists) keep only the last occurrence; a `kind: "playlist"` warning
   * is emitted in `errors` when this happens.
   */
  raw: Record<string, unknown>;
};
