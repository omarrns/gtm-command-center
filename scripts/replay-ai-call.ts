#!/usr/bin/env tsx
/**
 * Replay a captured AI call by id, model name, or by the row it was called for.
 *
 * Usage:
 *   tsx scripts/replay-ai-call.ts <ai_call_id>
 *   tsx scripts/replay-ai-call.ts --opp <opportunity_id> [--purpose score]
 *   tsx scripts/replay-ai-call.ts --interview <interview_id>
 *   tsx scripts/replay-ai-call.ts --run <run_id>           # list calls
 *
 * For object/json calls the script re-runs against the same model with the
 * captured prompt and prints both the original and the new response so you
 * can diff. Text calls just print the captured payload (no replay).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createSupabaseServiceClient } from "../src/lib/supabase/service";
import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

interface AiCallRow {
  id: string;
  created_at: string;
  run_id: string | null;
  user_id: string | null;
  scope_table: string | null;
  scope_id: string | null;
  call_purpose: string | null;
  model: string;
  call_kind: "text" | "json" | "object";
  system_prompt: string | null;
  user_prompt: string | null;
  schema_summary: string | null;
  response_text: string | null;
  response_object: any;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  error: string | null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const svc = createSupabaseServiceClient();

  if (args[0] === "--opp") {
    const oppId = args[1];
    const purpose = args.includes("--purpose")
      ? args[args.indexOf("--purpose") + 1]
      : undefined;
    await listForScope(svc, "opportunities", oppId, purpose);
    return;
  }

  if (args[0] === "--interview") {
    const interviewId = args[1];
    await listForScope(svc, "onboarding_interviews", interviewId);
    return;
  }

  if (args[0] === "--run") {
    const runId = args[1];
    await listForRun(svc, runId);
    return;
  }

  // Single id replay
  const id = args[0];
  const row = await loadCall(svc, id);
  if (!row) {
    console.error(`No ai_call found with id=${id}`);
    process.exit(1);
  }
  await replayOne(row);
}

async function loadCall(svc: any, id: string): Promise<AiCallRow | null> {
  const { data, error } = await svc
    .from("ai_calls")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }
  return data as AiCallRow | null;
}

async function listForScope(
  svc: any,
  scopeTable: string,
  scopeId: string,
  purpose?: string,
) {
  const query = svc
    .from("ai_calls")
    .select(
      "id, created_at, call_purpose, call_kind, model, latency_ms, input_tokens, output_tokens, error",
    )
    .eq("scope_table", scopeTable)
    .eq("scope_id", scopeId)
    .order("created_at", { ascending: false });

  if (purpose) query.eq("call_purpose", purpose);

  const { data, error } = await query;
  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }
  if (!data?.length) {
    console.log(`No ai_calls for ${scopeTable}=${scopeId}`);
    return;
  }
  console.log(`AI calls for ${scopeTable}=${scopeId}:`);
  for (const row of data as AiCallRow[]) {
    const status = row.error ? `ERROR` : `ok`;
    console.log(
      `  ${row.id}  ${row.created_at}  ${row.call_purpose ?? "-"}  ${row.call_kind}  ${row.model}  ${row.latency_ms ?? "-"}ms  in=${row.input_tokens ?? "-"} out=${row.output_tokens ?? "-"}  ${status}`,
    );
  }
  console.log(`\nReplay one with: tsx scripts/replay-ai-call.ts <id>`);
}

async function listForRun(svc: any, runId: string) {
  const { data, error } = await svc
    .from("ai_calls")
    .select(
      "id, created_at, scope_table, scope_id, call_purpose, call_kind, model, latency_ms, error",
    )
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }
  if (!data?.length) {
    console.log(`No ai_calls for run_id=${runId}`);
    return;
  }
  console.log(`AI calls for run_id=${runId}:`);
  for (const row of data as AiCallRow[]) {
    const status = row.error ? `ERROR: ${row.error.slice(0, 80)}` : `ok`;
    console.log(
      `  ${row.id}  ${row.created_at}  ${row.scope_table}/${row.scope_id?.slice(0, 8) ?? "-"}  ${row.call_purpose ?? "-"}  ${row.call_kind}  ${row.model}  ${row.latency_ms ?? "-"}ms  ${status}`,
    );
  }
}

async function replayOne(row: AiCallRow) {
  console.log(`\n=== Captured call ${row.id} ===`);
  console.log(
    `created=${row.created_at}  run=${row.run_id ?? "-"}  scope=${row.scope_table}/${row.scope_id ?? "-"}  purpose=${row.call_purpose ?? "-"}`,
  );
  console.log(
    `model=${row.model}  kind=${row.call_kind}  latency=${row.latency_ms}ms  tokens in/out=${row.input_tokens}/${row.output_tokens}`,
  );
  if (row.error) {
    console.log(`\nORIGINAL ERROR: ${row.error}`);
  }
  console.log(`\n--- system prompt ---\n${row.system_prompt ?? "(none)"}`);
  console.log(`\n--- user prompt ---\n${row.user_prompt ?? "(none)"}`);
  if (row.response_text) {
    console.log(`\n--- original response (text) ---\n${row.response_text}`);
  }
  if (row.response_object) {
    console.log(
      `\n--- original response (object) ---\n${JSON.stringify(row.response_object, null, 2)}`,
    );
  }

  if (!row.system_prompt && !row.user_prompt) {
    console.log("\nCannot replay — no captured prompt.");
    return;
  }

  console.log(`\n=== Replaying against ${row.model} ===`);
  const start = Date.now();
  try {
    if (row.call_kind === "object") {
      // Without the original schema, replay returns plain JSON via generateText.
      // Use a permissive object schema so the SDK doesn't reject.
      const { object } = await generateObject({
        model: anthropic(row.model),
        system: row.system_prompt ?? "",
        prompt: row.user_prompt ?? "",
        schema: z.record(z.string(), z.any()),
      });
      console.log(`\n--- new response (object, ${Date.now() - start}ms) ---`);
      console.log(JSON.stringify(object, null, 2));
    } else {
      const { text } = await generateText({
        model: anthropic(row.model),
        system: row.system_prompt ?? "",
        prompt: row.user_prompt ?? "",
      });
      console.log(`\n--- new response (text, ${Date.now() - start}ms) ---`);
      console.log(text);
    }
  } catch (err) {
    console.error(
      `\nReplay failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

function printUsage() {
  console.log(`Usage:
  tsx scripts/replay-ai-call.ts <ai_call_id>
  tsx scripts/replay-ai-call.ts --opp <opportunity_id> [--purpose score]
  tsx scripts/replay-ai-call.ts --interview <interview_id>
  tsx scripts/replay-ai-call.ts --run <run_id>`);
}

main().catch((err) => {
  console.error("replay-ai-call crashed:", err);
  process.exit(1);
});
