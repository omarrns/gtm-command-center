/**
 * One-shot diagnostic: pull recent failed `score-account` calls from
 * `ai_calls` and report the failure class so we can decide whether the
 * load-bearing fix is the maxOutputTokens bump, the schema loosen, or
 * the prompt clarification.
 *
 * Usage: tsx scripts/inspect-failed-scoring-calls.ts [limit]
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const limit = Number(process.argv[2] ?? 8);

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env");
  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await svc
    .from("ai_calls")
    .select(
      "id, created_at, model, scope_id, error, output_tokens, input_tokens, total_tokens, latency_ms, system_prompt, user_prompt",
    )
    .eq("call_purpose", "score-account")
    .not("error", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data?.length) {
    console.log("no failed score-account calls in ai_calls");
    return;
  }

  console.log(`found ${data.length} failed score-account calls\n`);

  for (const row of data) {
    const sysLen = row.system_prompt?.length ?? 0;
    const usrLen = row.user_prompt?.length ?? 0;
    const headline = (row.error ?? "").split("\n")[0]?.slice(0, 200);
    console.log(`──────────────────────────────────────────────`);
    console.log(`id:           ${row.id}`);
    console.log(`created_at:   ${row.created_at}`);
    console.log(`model:        ${row.model}`);
    console.log(`oppId:        ${row.scope_id}`);
    console.log(`latency_ms:   ${row.latency_ms}`);
    console.log(
      `tokens:       in=${row.input_tokens ?? "?"} out=${row.output_tokens ?? "?"} total=${row.total_tokens ?? "?"}`,
    );
    console.log(`prompt chars: sys=${sysLen} user=${usrLen}`);
    console.log(`error head:   ${headline}`);
    if (row.error && row.error.length > headline.length) {
      console.log(`error tail:`);
      console.log(
        row.error
          .split("\n")
          .slice(0, 12)
          .map((line: string) => `  ${line}`)
          .join("\n"),
      );
    }
  }

  // Aggregate hints.
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`aggregate signals:`);

  const withTokens = data.filter(
    (r): r is typeof r & { output_tokens: number } =>
      typeof r.output_tokens === "number",
  );
  if (withTokens.length) {
    const max = Math.max(...withTokens.map((r) => r.output_tokens));
    const avg = Math.round(
      withTokens.reduce((s, r) => s + r.output_tokens, 0) / withTokens.length,
    );
    const nearCap = withTokens.filter((r) => r.output_tokens >= 3900).length;
    console.log(
      `  output_tokens: avg=${avg} max=${max} >=3900 (truncation suspect): ${nearCap}/${withTokens.length}`,
    );
  } else {
    console.log(`  output_tokens: not reported on any failure row`);
  }

  const messageBuckets = new Map<string, number>();
  for (const row of data) {
    const head = (row.error ?? "")
      .split("\n")[0]
      ?.replace(/[0-9a-f-]{36}/gi, "<uuid>")
      ?.slice(0, 120);
    if (!head) continue;
    messageBuckets.set(head, (messageBuckets.get(head) ?? 0) + 1);
  }
  console.log(`  error headline buckets:`);
  for (const [head, count] of [...messageBuckets.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`    ${count}× ${head}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
