import { gateway, generateText } from "ai";
import { captureAiCall, type AiCallScope } from "@/lib/ai/calls";

/**
 * Claude calls via Vercel AI SDK v6 + AI Gateway.
 *
 * Auth: `AI_GATEWAY_API_KEY` locally, or OIDC on Vercel deploys.
 *
 * Both helpers accept an optional `scope` for ai_calls capture so any
 * call can be replayed by id later. When omitted, capture is skipped
 * (best-effort observability — never breaks the actual call).
 */

/**
 * Central model-id registry. When a Claude version is deprecated, change the
 * literal here and every call site updates. Tier names describe the role,
 * not the marketing name.
 */
export const MODELS = {
  /** Reasoning-tier — deep scoring, orchestration, extraction. */
  opus: "anthropic/claude-opus-4.6",
  /** Pipeline-tier — high-volume batch work, chat, fast scoring. */
  sonnet: "anthropic/claude-sonnet-4.6",
  /** Utility-tier — narrow extraction/classification only. */
  haiku: "anthropic/claude-haiku-4.5",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

const DEFAULT_MODEL: ModelId = MODELS.opus;

/**
 * Call Claude expecting a JSON object response. Strips code fences and parses.
 * Throws with a truncated snippet if parsing fails.
 */
export async function runClaudeJson<T = unknown>({
  system,
  prompt,
  model: modelName = DEFAULT_MODEL,
  maxTokens = 4096,
  scope,
}: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  scope?: AiCallScope;
}): Promise<T> {
  const start = Date.now();
  let text = "";
  let usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } = {};

  try {
    const result = await generateText({
      model: gateway(modelName),
      system,
      prompt,
      maxOutputTokens: maxTokens,
    });
    text = result.text;
    usage = {
      inputTokens: result.usage?.inputTokens ?? undefined,
      outputTokens: result.usage?.outputTokens ?? undefined,
      totalTokens: result.usage?.totalTokens ?? undefined,
    };
  } catch (err) {
    await captureAiCall(scope, {
      model: modelName,
      callKind: "json",
      systemPrompt: system,
      userPrompt: prompt,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as T;
    await captureAiCall(scope, {
      model: modelName,
      callKind: "json",
      systemPrompt: system,
      userPrompt: prompt,
      responseText: text,
      responseObject: parsed as unknown,
      ...usage,
      latencyMs: Date.now() - start,
    });
    return parsed;
  } catch (err) {
    // Capture the FULL response text — the audit specifically called out
    // that the previous `text.slice(0, 500)` truncation in the error message
    // threw away the data needed to debug the parse failure.
    await captureAiCall(scope, {
      model: modelName,
      callKind: "json",
      systemPrompt: system,
      userPrompt: prompt,
      responseText: text,
      ...usage,
      latencyMs: Date.now() - start,
      error: `JSON parse failed: ${(err as Error).message}`,
    });
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
  scope,
}: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  scope?: AiCallScope;
}): Promise<string> {
  const start = Date.now();
  try {
    const result = await generateText({
      model: gateway(modelName),
      system,
      prompt,
      maxOutputTokens: maxTokens,
    });
    await captureAiCall(scope, {
      model: modelName,
      callKind: "text",
      systemPrompt: system,
      userPrompt: prompt,
      responseText: result.text,
      inputTokens: result.usage?.inputTokens ?? undefined,
      outputTokens: result.usage?.outputTokens ?? undefined,
      totalTokens: result.usage?.totalTokens ?? undefined,
      latencyMs: Date.now() - start,
    });
    return result.text;
  } catch (err) {
    await captureAiCall(scope, {
      model: modelName,
      callKind: "text",
      systemPrompt: system,
      userPrompt: prompt,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
