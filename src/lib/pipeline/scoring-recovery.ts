import type { z } from "zod";

export function recoverObjectFromError<S extends z.ZodType>(
  err: unknown,
  schema: S,
): z.infer<S> | null {
  const text = extractErrorText(err);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as unknown;
    const normalized = normalizeJsonStrings(parsed);
    const result = schema.safeParse(normalized);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function extractErrorText(err: unknown): string | null {
  const text = (err as { text?: unknown } | null)?.text;
  if (typeof text === "string" && text.trim()) return text;
  const cause = (err as { cause?: unknown } | null)?.cause;
  const causeText = (cause as { text?: unknown } | null)?.text;
  return typeof causeText === "string" && causeText.trim() ? causeText : null;
}

function normalizeJsonStrings(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
    try {
      return normalizeJsonStrings(JSON.parse(trimmed) as unknown);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonStrings(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeJsonStrings(entry),
      ]),
    );
  }

  return value;
}
