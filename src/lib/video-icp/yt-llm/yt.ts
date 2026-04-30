import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import {
  YtDlp,
  type ExecBuilderResult,
  type PlaylistInfo,
  type VideoInfo,
} from "ytdlp-nodejs";
import { languageFromSrtName, pickPreferredSrt } from "./transcript/index.js";

let _ytdlp: YtDlp | null = null;
function getYtDlp(): YtDlp {
  if (_ytdlp) return _ytdlp;
  const binaryPath = process.env["YT_LLM_BINARY_PATH"];
  _ytdlp = binaryPath ? new YtDlp({ binaryPath }) : new YtDlp();
  return _ytdlp;
}

export type Entry = { url: string; id: string };

export type FetchOptions = {
  /** Forwarded to yt-dlp's --socket-timeout (seconds). Default 30. */
  socketTimeout?: number;
};

const DEFAULT_SOCKET_TIMEOUT = 30;

export async function fetchEntries(
  url: string,
  options: FetchOptions = {},
): Promise<Entry[]> {
  const result = (await getYtDlp().execAsync(url, {
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    print: "%(id)s\t%(webpage_url)s",
    socketTimeout: options.socketTimeout ?? DEFAULT_SOCKET_TIMEOUT,
  })) as ExecBuilderResult;
  const entries: Entry[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.includes("\t")) continue;
    const idx = trimmed.indexOf("\t");
    const id = trimmed.slice(0, idx).trim();
    const vurl = trimmed.slice(idx + 1).trim();
    if (id && vurl) entries.push({ id, url: vurl });
  }
  return entries;
}

export async function fetchInfo(
  url: string,
  options: FetchOptions = {},
): Promise<VideoInfo> {
  // Replicates ytdlp-nodejs's getInfoAsync but threads through socketTimeout
  // (which getInfoAsync's narrow InfoOptions type does not expose).
  const result = (await getYtDlp().execAsync(url, {
    dumpSingleJson: true,
    flatPlaylist: false,
    noWarnings: true,
    socketTimeout: options.socketTimeout ?? DEFAULT_SOCKET_TIMEOUT,
  })) as ExecBuilderResult;
  return JSON.parse(result.stdout) as VideoInfo;
}

export type FetchCommentsOptions = {
  max: number;
  sort: "top" | "new";
  socketTimeout?: number;
};

export async function fetchComments(
  url: string,
  opts: FetchCommentsOptions,
): Promise<unknown[]> {
  // Bypass ytdlp-nodejs's getComments() helper — it silently catches JSON parse
  // errors and returns [], which would mask a comment fetch failure as "video
  // has no comments." Going through execAsync directly lets non-zero exits and
  // truncated payloads throw normally so analyze.ts can surface a kind: "comments"
  // error instead of returning a misleading empty array.
  const result = (await getYtDlp().execAsync(url, {
    writeComments: true,
    dumpSingleJson: true,
    skipDownload: true,
    noPlaylist: true,
    noWarnings: true,
    extractorArgs: {
      // ytdlp-nodejs space-joins this array, but yt-dlp's --extractor-args
      // grammar uses ';' to separate items within one key. Space-joined args
      // get silently dropped — verified empirically: max_comments=30 was
      // ignored and 244 comments came back. Pre-join with ';' as a single
      // element so the wire form is `youtube:max_comments=30;comment_sort=top;...`.
      // player_skip=webpage matches upstream getComments — skips the slow
      // initial HTML scrape not needed for the comments endpoint.
      youtube: [
        `max_comments=${opts.max};comment_sort=${opts.sort};player_skip=webpage`,
      ],
    },
    socketTimeout: opts.socketTimeout ?? DEFAULT_SOCKET_TIMEOUT,
  })) as ExecBuilderResult;
  const parsed = JSON.parse(result.stdout) as { comments?: unknown };
  return Array.isArray(parsed.comments) ? parsed.comments : [];
}

export type CaptionsFile = {
  srtPath: string;
  language: string;
  filename: string;
};

export type CaptionsResult =
  | { kind: "ok"; file: CaptionsFile }
  | { kind: "error"; reason: string }
  | { kind: "none" };

export async function fetchCaptionsToTemp(
  url: string,
  tempDir: string,
  subLangs: string[],
  options: FetchOptions = {},
): Promise<CaptionsResult> {
  // Subtitle fetches can fail per-language (HTTP 429, missing track, etc.) without
  // meaning "no captions" — yt-dlp exits non-zero but may still have written some files.
  // Match the Python script's `check=False` behavior: capture the error, then inspect
  // the tempdir. If SRTs landed, treat the throw as transient. If none landed, surface
  // the suppressed error to the caller so it can distinguish "video has no captions" from
  // "caption fetch hard-failed (geo block, age gate, rate limit, etc.)".
  let suppressedError: string | null = null;
  try {
    await getYtDlp().execAsync(url, {
      skipDownload: true,
      noPlaylist: true,
      writeSubs: true,
      writeAutoSubs: true,
      subLangs,
      subFormat: "srt/vtt/best",
      convertSubs: "srt",
      noWarnings: true,
      output: join(tempDir, "raw.%(ext)s"),
      socketTimeout: options.socketTimeout ?? DEFAULT_SOCKET_TIMEOUT,
    });
  } catch (err) {
    suppressedError = err instanceof Error ? err.message : String(err);
  }
  const srts = readdirSync(tempDir)
    .filter((f) => f.endsWith(".srt"))
    .map((f) => join(tempDir, f));
  const chosen = pickPreferredSrt(srts, subLangs);
  if (chosen) {
    return {
      kind: "ok",
      file: {
        srtPath: chosen,
        language: languageFromSrtName(chosen),
        filename: basename(chosen),
      },
    };
  }
  if (suppressedError) {
    return { kind: "error", reason: suppressedError };
  }
  return { kind: "none" };
}

export type { PlaylistInfo, VideoInfo };
