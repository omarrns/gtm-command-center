import { runClaudeJson } from "@/lib/ai/anthropic";
import type { AiCallScope } from "@/lib/ai/calls";

export type JsonValidator<T> = (value: T) => string | null;

export async function runJsonWithFallback<T>({
  system,
  prompt,
  primaryModel,
  fallbackModel,
  maxTokens,
  scope,
  validate,
}: {
  system: string;
  prompt: string;
  primaryModel: string;
  fallbackModel: string;
  maxTokens?: number;
  scope?: AiCallScope;
  validate: JsonValidator<T>;
}): Promise<T> {
  try {
    const primary = await runClaudeJson<T>({
      system,
      prompt,
      model: primaryModel,
      maxTokens,
      scope,
    });
    const validationError = validate(primary);
    if (!validationError) return primary;
    throw new Error(`Primary model output failed validation: ${validationError}`);
  } catch {
    const fallback = await runClaudeJson<T>({
      system,
      prompt,
      model: fallbackModel,
      maxTokens,
      scope,
    });
    const validationError = validate(fallback);
    if (validationError) {
      throw new Error(`Fallback model output failed validation: ${validationError}`);
    }
    return fallback;
  }
}

