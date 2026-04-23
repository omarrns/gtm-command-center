import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { firecrawlScrape } from "@/lib/ai/firecrawl";
import type {
  OnboardingArtifactRow,
  OnboardingArtifactSourceType,
} from "@/lib/supabase/types";

export interface IngestOptions {
  userId: string;
  interviewId: string | null;
  templateId?: string;
  kind: string;
  sourceLabel?: string;
}

type PersistResult =
  | { status: "succeeded"; normalized_markdown: string }
  | { status: "failed"; error_message: string };

interface PersistSource {
  sourceType: OnboardingArtifactSourceType;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
}

async function persistArtifact(
  svc: SupabaseClient,
  opts: IngestOptions,
  source: PersistSource,
  result: PersistResult,
): Promise<OnboardingArtifactRow> {
  const { data, error } = await svc
    .from("onboarding_artifacts")
    .insert({
      user_id: opts.userId,
      interview_id: opts.interviewId,
      kind: opts.kind,
      source_type: source.sourceType,
      source_label: opts.sourceLabel ?? null,
      source_url: source.sourceUrl ?? null,
      file_name: source.fileName ?? null,
      mime_type: source.mimeType ?? null,
      status: result.status,
      normalized_markdown:
        result.status === "succeeded" ? result.normalized_markdown : null,
      error_message: result.status === "failed" ? result.error_message : null,
      created_from_template_id: opts.templateId ?? "job_search",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to persist artifact: ${error?.message ?? "no row returned"}`,
    );
  }

  return data as OnboardingArtifactRow;
}

export async function ingestUrl(
  url: string,
  opts: IngestOptions,
  svc: SupabaseClient,
): Promise<OnboardingArtifactRow> {
  const source: PersistSource = { sourceType: "url", sourceUrl: url };

  try {
    const markdown = await firecrawlScrape(url);
    if (!markdown.trim()) {
      return persistArtifact(svc, opts, source, {
        status: "failed",
        error_message:
          "Scrape returned no content. The page may require auth, be JS-heavy, or block scrapers. Paste text or upload a file instead.",
      });
    }
    return persistArtifact(svc, opts, source, {
      status: "succeeded",
      normalized_markdown: markdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return persistArtifact(svc, opts, source, {
      status: "failed",
      error_message: `Scrape failed: ${message}. Paste text or upload a file instead.`,
    });
  }
}

// Scrape + persist N URLs concurrently. Each item carries its own kind so a
// heterogeneous paste (customer URLs + a LinkedIn buyer) gets tagged
// correctly per URL. ingestUrl swallows Firecrawl errors into failed rows;
// this only rejects if a DB insert itself fails.
export async function ingestUrls(
  items: ReadonlyArray<{ url: string; kind: string }>,
  baseOpts: Omit<IngestOptions, "kind">,
  svc: SupabaseClient,
): Promise<OnboardingArtifactRow[]> {
  return Promise.all(
    items.map((item) =>
      ingestUrl(item.url, { ...baseOpts, kind: item.kind }, svc),
    ),
  );
}

export async function ingestText(
  text: string,
  opts: IngestOptions,
  svc: SupabaseClient,
): Promise<OnboardingArtifactRow> {
  const source: PersistSource = { sourceType: "text" };
  const trimmed = text.trim();

  if (!trimmed) {
    return persistArtifact(svc, opts, source, {
      status: "failed",
      error_message: "Pasted text is empty.",
    });
  }

  return persistArtifact(svc, opts, source, {
    status: "succeeded",
    normalized_markdown: trimmed,
  });
}

export async function ingestFile(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType: string,
  opts: IngestOptions,
  svc: SupabaseClient,
): Promise<OnboardingArtifactRow> {
  const source: PersistSource = {
    sourceType: "file",
    fileName,
    mimeType,
  };

  const isPdf =
    mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return persistArtifact(svc, opts, source, {
      status: "failed",
      error_message: `Unsupported file type: ${mimeType || fileName}. Supported: PDF. Paste the content as text instead.`,
    });
  }

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const extracted = await extractText(pdf, { mergePages: true });
    // With mergePages: true, unpdf returns text as a single string.
    const markdown = extracted.text;

    if (!markdown.trim()) {
      return persistArtifact(svc, opts, source, {
        status: "failed",
        error_message:
          "PDF contains no extractable text (likely scanned or image-only). Paste the content as text instead.",
      });
    }

    return persistArtifact(svc, opts, source, {
      status: "succeeded",
      normalized_markdown: markdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return persistArtifact(svc, opts, source, {
      status: "failed",
      error_message: `PDF parse failed: ${message}. Paste the content as text instead.`,
    });
  }
}
