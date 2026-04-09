import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

/**
 * Claude calls via Vercel AI SDK v6 + @ai-sdk/anthropic.
 *
 * Auth: OIDC via `vercel env pull` — AI Gateway handles provider auth,
 * routing, failover, and cost tracking on deploy.
 */

const DEFAULT_MODEL = "claude-opus-4-6";

function model(name: string = DEFAULT_MODEL) {
  return anthropic(name);
}

/**
 * Call Claude expecting a JSON object response. Strips code fences and parses.
 * Throws with a truncated snippet if parsing fails.
 */
export async function runClaudeJson<T = unknown>({
  system,
  prompt,
  model: modelName = DEFAULT_MODEL,
  maxTokens = 4096,
}: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const { text } = await generateText({
    model: model(modelName),
    system,
    prompt,
    maxOutputTokens: maxTokens,
  });

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse Claude response as JSON: ${(err as Error).message}\n\nRaw:\n${text.slice(0, 500)}`,
    );
  }
}

export async function runClaudeText({
  system,
  prompt,
  model: modelName = DEFAULT_MODEL,
  maxTokens = 4096,
}: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const { text } = await generateText({
    model: model(modelName),
    system,
    prompt,
    maxOutputTokens: maxTokens,
  });
  return text;
}
