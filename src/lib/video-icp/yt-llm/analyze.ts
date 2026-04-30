import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dedupeSegments, parseSrt, toParagraphs } from "./transcript/index.js";
import {
  type AnalyzeError,
  type AnalyzeResult,
  type Comment,
  type Transcript,
  type VideoBundle,
  type VideoMeta,
  VideoBundleSchema,
} from "./schema.js";
import { DEFAULT_ALLOWED_HOSTS, isAllowedHost } from "./url.js";
import {
  fetchCaptionsToTemp,
  fetchComments,
  fetchEntries,
  fetchInfo,
  type Entry,
  type FetchCommentsOptions,
  type VideoInfo,
} from "./yt.js";

export type AnalyzeOptions = {
  /** Subtitle language patterns to fetch. Defaults to `['en.*']` to match the Python script. */
  subLangs?: string[];
  /**
   * Honored between playlist entries. Aborting after `fetchEntries` returns
   * does not interrupt an in-flight `fetchInfo` or caption fetch — the current
   * entry runs to completion, then the loop exits. For single-video calls this
   * means `abort()` is effectively a no-op until the call resolves. True
   * per-process cancellation is on the v0.2 roadmap.
   */
  signal?: AbortSignal;
  /** Cap on entries pulled from a playlist. Default 200. Set to 0 to disable. */
  maxEntries?: number;
  /** Parallel yt-dlp invocations. Default 1 (sequential). */
  concurrency?: number;
  /** Forwarded to yt-dlp's --socket-timeout (seconds). Default 30. */
  socketTimeout?: number;
  /** Hostname allowlist. Default: YouTube hosts only. Pass `"any"` to disable validation. */
  allowedHosts?: readonly string[] | "any";
  /**
   * Opt in to comment fetching. Off by default — comment fetching runs as a
   * separate yt-dlp invocation, is rate-limit prone, and adds material wall
   * time on videos with non-trivial comment counts. When set, comments fetch
   * runs *after* metadata + transcript: a comment-fetch failure is captured
   * as `kind: "comments"` in `result.errors[]` and the bundle still ships
   * with `comments: null` rather than dropping the whole entry.
   */
  comments?: FetchCommentsOptions;
};

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_SOCKET_TIMEOUT = 30;

export async function analyze(
  url: string,
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const subLangs = options.subLangs ?? ["en.*"];
  const allowed = options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  // CLI's `parsePositive` rejects <1; library callers passing 0 still get
  // clamped to 1 here so a bad value can't deadlock the worker pool.
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const socketTimeout = options.socketTimeout ?? DEFAULT_SOCKET_TIMEOUT;
  const commentOpts = options.comments;
  const signal = options.signal;

  const bundles: VideoBundle[] = [];
  const errors: AnalyzeError[] = [];
  const raw: Record<string, unknown> = {};

  if (allowed !== "any" && !isAllowedHost(url, allowed)) {
    return {
      bundles,
      raw,
      errors: [
        {
          id: url,
          kind: "playlist",
          reason: `url host not in allowed hosts (allowed: ${allowed.join(", ")}). pass allowedHosts: "any" to bypass.`,
        },
      ],
    };
  }

  if (signal?.aborted) {
    return {
      bundles,
      raw,
      errors: [{ id: url, kind: "playlist", reason: "aborted before start" }],
    };
  }

  let entries: Entry[];
  try {
    entries = await fetchEntries(url, { socketTimeout });
  } catch (err) {
    return {
      bundles,
      raw,
      errors: [
        {
          id: url,
          kind: "playlist",
          reason: `entry enumeration failed: ${describe(err)}`,
        },
      ],
    };
  }
  if (entries.length === 0) {
    return {
      bundles,
      raw,
      errors: [
        {
          id: url,
          kind: "playlist",
          reason: "no playable entries (private, deleted, or invalid URL)",
        },
      ],
    };
  }

  const limited =
    maxEntries > 0 && entries.length > maxEntries
      ? entries.slice(0, maxEntries)
      : entries;
  if (limited.length < entries.length) {
    errors.push({
      id: url,
      kind: "playlist",
      reason: `entry count ${entries.length} exceeded maxEntries ${maxEntries}; processing first ${limited.length}`,
    });
  }

  // Pre-sized slot array preserves playlist order under concurrency > 1
  // (workers complete out-of-order; bundles[i] must still correspond to
  // limited[i] so consumers can join against the original entries list).
  const slots: (VideoBundle | undefined)[] = new Array(limited.length);
  let cursor = 0;
  const workerCount = Math.min(concurrency, limited.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (signal?.aborted) return;
      const idx = cursor++;
      if (idx >= limited.length) return;
      const entry = limited[idx]!;
      // Re-validate per entry. yt-dlp's flat-playlist can return webpage_urls
      // that route through non-YouTube extractors; the top-level allowlist
      // check on the input URL doesn't cover them.
      if (allowed !== "any" && !isAllowedHost(entry.url, allowed)) {
        errors.push({
          id: entry.id,
          kind: "video",
          reason: `entry url host not in allowlist: ${entry.url}`,
        });
        continue;
      }
      try {
        const result = await analyzeOne(
          entry,
          subLangs,
          socketTimeout,
          commentOpts,
        );
        if (!result) {
          errors.push({
            id: entry.id,
            kind: "video",
            reason: "livestream — skipped",
          });
          continue;
        }
        slots[idx] = result.bundle;
        if (entry.id in raw) {
          errors.push({
            id: entry.id,
            kind: "playlist",
            reason: `duplicate entry id ${entry.id}; raw.info kept the last occurrence`,
          });
        }
        raw[entry.id] = result.rawInfo;
        if (result.transcriptError) {
          errors.push({
            id: entry.id,
            kind: "transcript",
            reason: result.transcriptError,
          });
        }
        if (result.commentsError) {
          errors.push({
            id: entry.id,
            kind: "comments",
            reason: result.commentsError,
          });
        }
      } catch (err) {
        errors.push({ id: entry.id, kind: "video", reason: describe(err) });
      }
    }
  });
  await Promise.all(workers);

  for (const b of slots) if (b) bundles.push(b);

  if (signal?.aborted) {
    errors.push({ id: url, kind: "playlist", reason: "aborted mid-run" });
  }

  return { bundles, errors, raw };
}

async function analyzeOne(
  entry: Entry,
  subLangs: string[],
  socketTimeout: number,
  commentOpts: FetchCommentsOptions | undefined,
): Promise<{
  bundle: VideoBundle;
  rawInfo: VideoInfo;
  transcriptError?: string;
  commentsError?: string;
} | null> {
  const info = await fetchInfo(entry.url, { socketTimeout });
  if (info.is_live || info.live_status === "is_live") return null;
  const meta = buildMeta(info);
  const tr = await buildTranscript(entry.url, subLangs, socketTimeout);
  // Comments fetch is intentionally separate from fetchInfo so a comment-only
  // failure (rate limit, paginator timeout, geo-blocked thread) cannot drop
  // the metadata + transcript bundle. On failure: comments stays null, error
  // bubbles up as kind: "comments" — bundle still ships.
  let comments: Comment[] | null = null;
  let commentsError: string | undefined;
  if (commentOpts) {
    try {
      const rawComments = await fetchComments(entry.url, {
        ...commentOpts,
        socketTimeout,
      });
      comments = buildComments(rawComments);
    } catch (err) {
      commentsError = `comment fetch failed: ${describe(err)}`;
    }
  }
  const bundle: VideoBundle = {
    source: { url: entry.url, id: entry.id, platform: "youtube" },
    meta,
    chapters: (info.chapters ?? []).map((c) => ({
      startSec: c.start_time,
      title: c.title,
    })),
    transcript: tr.transcript,
    // Only include the `comments` key when the caller opted in. Keeping the
    // field absent in the no-opt-in path preserves byte-identical --json
    // output and lets pre-v0.2 bundle constructions still parse.
    ...(commentOpts ? { comments } : {}),
  };
  const parsed = VideoBundleSchema.parse(bundle);
  const out: {
    bundle: VideoBundle;
    rawInfo: VideoInfo;
    transcriptError?: string;
    commentsError?: string;
  } = { bundle: parsed, rawInfo: info };
  if (tr.error) out.transcriptError = tr.error;
  if (commentsError) out.commentsError = commentsError;
  return out;
}

async function buildTranscript(
  url: string,
  subLangs: string[],
  socketTimeout: number,
): Promise<{ transcript: Transcript | null; error?: string }> {
  const tmp = mkdtempSync(join(tmpdir(), "yt-llm-"));
  try {
    const result = await fetchCaptionsToTemp(url, tmp, subLangs, {
      socketTimeout,
    });
    if (result.kind === "none") return { transcript: null };
    if (result.kind === "error") {
      return {
        transcript: null,
        error: `caption fetch failed: ${result.reason}`,
      };
    }
    const captions = result.file;
    const raw = readFileSync(captions.srtPath, "utf-8");
    const segments = dedupeSegments(parseSrt(raw));
    const paragraphs = toParagraphs(segments, 30);
    const full = segments
      .map((s) => s.text)
      .join(" ")
      .trim();
    return {
      transcript: {
        source: "captions",
        sourceDetail: captions.filename,
        language: captions.language,
        full,
        segments,
        paragraphs,
      },
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function buildMeta(info: VideoInfo): VideoMeta {
  return {
    title: info.title,
    channel: info.channel ?? info.uploader ?? "",
    channelId: info.channel_id ?? null,
    channelUrl: info.channel_url ?? null,
    uploader: info.uploader ?? null,
    uploadedAt: normalizeUploadDate(info.upload_date),
    durationSec: info.duration ?? 0,
    durationString: info.duration_string ?? null,
    views: info.view_count ?? null,
    likeCount: info.like_count ?? null,
    commentCount: info.comment_count ?? null,
    description: info.description ?? "",
    tags: info.tags ?? [],
    categories: info.categories ?? [],
    thumbnailUrl: info.thumbnail ?? null,
    isLive: Boolean(info.is_live),
    wasLive: Boolean(info.was_live),
    liveStatus: info.live_status ?? null,
    ageLimit: info.age_limit ?? 0,
    availability: info.availability ?? null,
  };
}

type RawComment = {
  id?: unknown;
  parent?: unknown;
  text?: unknown;
  author?: unknown;
  author_id?: unknown;
  author_is_uploader?: unknown;
  author_is_verified?: unknown;
  is_pinned?: unknown;
  is_favorited?: unknown;
  like_count?: unknown;
  timestamp?: unknown;
};

export function buildComments(raw: unknown[]): Comment[] {
  const out: Comment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as RawComment;
    if (typeof c.id !== "string" || typeof c.text !== "string") continue;
    out.push({
      id: c.id,
      parentId: typeof c.parent === "string" ? c.parent : "root",
      text: c.text,
      author: typeof c.author === "string" ? c.author : "",
      authorId: typeof c.author_id === "string" ? c.author_id : null,
      authorIsUploader: c.author_is_uploader === true,
      authorIsVerified: c.author_is_verified === true,
      isPinned: c.is_pinned === true,
      isFavorited: c.is_favorited === true,
      likeCount: typeof c.like_count === "number" ? c.like_count : null,
      timestampSec: typeof c.timestamp === "number" ? c.timestamp : null,
    });
  }
  return out;
}

/** Convert yt-dlp's "20260427" upload_date string to ISO "2026-04-27". Returns null on failure. */
export function normalizeUploadDate(
  s: string | null | undefined,
): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
