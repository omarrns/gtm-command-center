import { analyze, sanitizeBundle } from "@/lib/video-icp/yt-llm";
import { videoIcpExtractionSchema, type VideoIcpExtraction } from "./schemas";

export async function extractVideoIcpBundle(
  youtubeUrl: string,
): Promise<VideoIcpExtraction> {
  const result = await analyze(youtubeUrl, {
    comments: { max: 100, sort: "top" },
    maxEntries: 1,
  });

  const bundle = result.bundles[0];
  if (!bundle) {
    throw new Error(formatExtractionFailure("Video extraction failed", result));
  }

  const sanitized = sanitizeBundle(bundle);
  if (!sanitized.transcript) {
    throw new Error(formatExtractionFailure("Transcript is required", result));
  }

  const commentsError = findCommentsError(result.errors);
  const commentsStatus =
    sanitized.comments === null || commentsError ? "failed" : "fetched";

  return videoIcpExtractionSchema.parse({
    source: sanitized.source,
    meta: sanitized.meta,
    transcript: sanitized.transcript,
    comments:
      commentsStatus === "failed" ? null : (sanitized.comments ?? []),
    commentsStatus,
    commentsError:
      commentsStatus === "failed"
        ? (commentsError ?? "Comment fetch failed.")
        : null,
  });
}

function findCommentsError(
  errors: Array<{ kind?: string; reason: string }>,
): string | null {
  return errors.find((error) => error.kind === "comments")?.reason ?? null;
}

function formatExtractionFailure(
  prefix: string,
  result: Awaited<ReturnType<typeof analyze>>,
): string {
  const details = result.errors
    .map((error) => `${error.kind ?? "unknown"}: ${error.reason}`)
    .join("; ");
  return details ? `${prefix}: ${details}` : prefix;
}
