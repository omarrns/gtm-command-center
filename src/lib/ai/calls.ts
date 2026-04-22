/**
 * AI call capture + the wrapped generateObject helper.
 *
 * `captureAiCall` writes one row to `ai_calls` per model call so that any
 * call can be replayed by ID. Capture is best-effort — if the DB write
 * fails, we log a warning and continue. Observability must never break
 * the actual AI call.
 *
 * `runGenerateObject` is a thin wrapper around AI SDK's generateObject
 * that auto-captures the call. New call sites should use this instead of
 * importing generateObject directly so they get capture for free.
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createLogger } from "@/lib/logger";

export interface AiCallScope {
  runId?: string;
  userId?: string;
  scopeTable?: string;
  scopeId?: string;
  callPurpose?: string;
}

export interface CapturedCall {
  model: string;
  callKind: "text" | "json" | "object";
  systemPrompt?: string;
  userPrompt?: string;
  responseText?: string;
  responseObject?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  error?: string;
}

const MAX_TEXT = 100_000;

export async function captureAiCall(
  scope: AiCallScope | undefined,
  call: CapturedCall,
): Promise<void> {
  // Skip capture when there's no correlation context — debugging value
  // would be near-zero (no way to find this row later).
  if (!scope?.userId && !scope?.runId && !scope?.scopeId) {
    return;
  }

  try {
    const svc = createSupabaseServiceClient();
    await svc.from("ai_calls").insert({
      run_id: scope.runId ?? null,
      user_id: scope.userId ?? null,
      scope_table: scope.scopeTable ?? null,
      scope_id: scope.scopeId ?? null,
      call_purpose: scope.callPurpose ?? null,
      model: call.model,
      call_kind: call.callKind,
      system_prompt: truncate(call.systemPrompt),
      user_prompt: truncate(call.userPrompt),
      response_text: truncate(call.responseText),
      response_object: call.responseObject ?? null,
      input_tokens: call.inputTokens ?? null,
      output_tokens: call.outputTokens ?? null,
      total_tokens: call.totalTokens ?? null,
      latency_ms: call.latencyMs ?? null,
      error: call.error ?? null,
    });
  } catch (err) {
    const log = createLogger({ scope: "ai.capture", ...scope });
    log.warn("ai_call capture failed (best-effort, continuing)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function truncate(s: string | undefined | null): string | null {
  if (!s) return null;
  if (s.length <= MAX_TEXT) return s;
  return `${s.slice(0, MAX_TEXT)}\n…[truncated ${s.length - MAX_TEXT} chars]`;
}

/* ── Wrapped generateObject — auto-captures every call ────────────────── */

interface RunGenerateObjectArgs<S extends z.ZodType> {
  model: string;
  system: string;
  prompt: string;
  schema: S;
  maxOutputTokens?: number;
  scope?: AiCallScope;
}

export async function runGenerateObject<S extends z.ZodType>(
  args: RunGenerateObjectArgs<S>,
): Promise<z.infer<S>> {
  const start = Date.now();
  try {
    const result = await generateObject({
      model: anthropic(args.model),
      system: args.system,
      prompt: args.prompt,
      schema: args.schema,
      maxOutputTokens: args.maxOutputTokens,
    });

    await captureAiCall(args.scope, {
      model: args.model,
      callKind: "object",
      systemPrompt: args.system,
      userPrompt: args.prompt,
      responseObject: result.object,
      inputTokens: result.usage?.inputTokens ?? undefined,
      outputTokens: result.usage?.outputTokens ?? undefined,
      totalTokens: result.usage?.totalTokens ?? undefined,
      latencyMs: Date.now() - start,
    });

    return result.object as z.infer<S>;
  } catch (err) {
    await captureAiCall(args.scope, {
      model: args.model,
      callKind: "object",
      systemPrompt: args.system,
      userPrompt: args.prompt,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
