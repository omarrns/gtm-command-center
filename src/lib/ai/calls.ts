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
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createLogger } from "@/lib/logger";

// Module-scoped service client — avoid constructing one per AI call. The
// supabase-js client is safe to share across concurrent requests in serverless.
let cachedClient: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!cachedClient) cachedClient = createSupabaseServiceClient();
  return cachedClient;
}

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
  // would be near-zero (no way to find this row later). Warn so a new
  // call site that forgets to pass scope is visible at dev time.
  if (!scope?.userId && !scope?.runId && !scope?.scopeId) {
    if (process.env.NODE_ENV !== "production") {
      const log = createLogger({ scope: "ai.capture" });
      log.warn("skipping capture — no scope provided", {
        model: call.model,
        callKind: call.callKind,
        callPurpose: scope?.callPurpose,
      });
    }
    return;
  }

  try {
    const svc = getClient();
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

// Mirrors the @ai-sdk/anthropic v3.0.71 enum at
// node_modules/@ai-sdk/anthropic/dist/index.d.ts:134-138. `outputFormat`
// uses Anthropic's native `output_config.format.schema` (strictest;
// useful for small closed Zod schemas).
// `jsonTool` is the legacy tool-calling path (more permissive; required
// for orchestrator/extraction schemas that use z.record / z.unknown).
// `auto` lets the SDK pick. Default stays `jsonTool` for backward
// compatibility with existing call sites.
export type StructuredOutputMode = "outputFormat" | "jsonTool" | "auto";

interface RunGenerateObjectArgs<S extends z.ZodType> {
  model: string;
  system: string;
  prompt: string;
  schema: S;
  maxOutputTokens?: number;
  scope?: AiCallScope;
  // Per-call override for Anthropic's structured-output strategy. Most
  // callers should leave this undefined and inherit `jsonTool`; large
  // closed schemas can exceed `outputFormat` grammar limits.
  structuredOutputMode?: StructuredOutputMode;
}

type GenerateObjectForTests = <S extends z.ZodType>(
  args: RunGenerateObjectArgs<S>,
) => Promise<z.infer<S>> | z.infer<S>;

let generateObjectForTests: GenerateObjectForTests | null = null;

export function __setRunGenerateObjectForTests(
  fn: GenerateObjectForTests | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot override AI object generation in production.");
  }
  generateObjectForTests = fn;
}

export async function runGenerateObject<S extends z.ZodType>(
  args: RunGenerateObjectArgs<S>,
): Promise<z.infer<S>> {
  if (generateObjectForTests) {
    return generateObjectForTests(args);
  }

  const start = Date.now();
  // Default mode is `jsonTool` — Anthropic's native `outputFormat` path
  // enforces a strict subset of JSON Schema and rejects
  // `additionalProperties: <schema>` (z.record) plus empty schemas
  // (z.unknown/z.any). Orchestrator + extraction schemas use those, so
  // they must keep the legacy tool-calling path. Closed schemas (e.g.
  // icpAccountAnalysisSchema) opt into `outputFormat` per call for
  // stricter validation against verdict/tier enums and required fields.
  const structuredOutputMode = args.structuredOutputMode ?? "jsonTool";
  try {
    const result = await generateObject({
      model: anthropic(args.model),
      system: args.system,
      prompt: args.prompt,
      schema: args.schema,
      maxOutputTokens: args.maxOutputTokens,
      providerOptions: {
        anthropic: { structuredOutputMode },
      },
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
      error: enrichObjectGenError(err),
    });
    throw err;
  }
}

// AI SDK's NoObjectGeneratedError carries .text (the raw model output
// that failed validation) and .cause (the underlying ZodError or
// JSON-parse error). The default err.message just says "No object
// generated: response did not match schema" — useless for debugging.
// Persist the richer payload so future failures expose which sub-field
// or score value broke the schema instead of forcing another live
// repro to pin it down. Each piece is capped so a runaway response
// can't bury the cause.
function enrichObjectGenError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  const text = (err as { text?: unknown }).text;
  if (typeof text === "string" && text.length > 0) {
    parts.push(`\n[raw text]\n${text.slice(0, 4000)}`);
  }
  if (err.cause) {
    const causeStr =
      err.cause instanceof Error
        ? `${err.cause.name}: ${err.cause.message}`
        : String(err.cause);
    parts.push(`\n[cause]\n${causeStr.slice(0, 4000)}`);
  }
  return parts.join("\n");
}
