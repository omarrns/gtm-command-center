/**
 * Pull recent failed `ai_calls` rows for a given call_purpose and dump their
 * system + user prompts to disk so the prompt that produced the failure can
 * be replayed and inspected. Permanent — every regression in the LLM
 * boundary should land here first.
 *
 * Usage:
 *   pnpm inspect:ai-errors                       # default: score-account, 24h, 50 rows
 *   pnpm inspect:ai-errors -- --purpose=score    # any LIKE substring on call_purpose
 *   pnpm inspect:ai-errors -- --since=72h --limit=200
 *   pnpm inspect:ai-errors -- --user=omar@…      # narrow by user email
 *
 * Writes one .json per row under ./tmp/ai-call-errors/<run-timestamp>/.
 * Each file carries the full prompt pair so failed rows can be replayed
 * directly with the same model/scope context.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface CliArgs {
  purpose: string;
  since: string;
  limit: number;
  userEmail?: string;
}

function parseArgs(): CliArgs {
  const argMap = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) {
      argMap.set(raw.slice(2), "true");
    } else {
      argMap.set(raw.slice(2, eq), raw.slice(eq + 1));
    }
  }
  const limitRaw = argMap.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
  if (!Number.isFinite(limit) || limit <= 0 || limit > 1000) {
    throw new Error(
      `--limit must be a positive integer ≤ 1000 (got ${limitRaw})`,
    );
  }
  return {
    purpose: argMap.get("purpose") ?? "score-account",
    since: argMap.get("since") ?? "24h",
    limit,
    userEmail: argMap.get("user"),
  };
}

// "24h" → 24*60*60*1000 ms ago. Accepts h, d. Anything else throws.
function parseSinceMs(since: string): number {
  const match = since.match(/^(\d+)([hd])$/);
  if (!match)
    throw new Error(`--since must be like "24h" or "7d" (got "${since}")`);
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const factor = unit === "h" ? 3600_000 : 86400_000;
  return value * factor;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env (.env.local)");
  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sinceIso = new Date(
    Date.now() - parseSinceMs(args.since),
  ).toISOString();

  let userId: string | undefined;
  if (args.userEmail) {
    const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === args.userEmail);
    if (!user) throw new Error(`No auth user with email ${args.userEmail}`);
    userId = user.id;
  }

  let query = svc
    .from("ai_calls")
    .select(
      "id, created_at, model, call_purpose, scope_table, scope_id, error, system_prompt, user_prompt, output_tokens, latency_ms, user_id",
    )
    .not("error", "is", null)
    .ilike("call_purpose", `%${args.purpose}%`)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (userId) query = query.eq("user_id", userId);

  const { data: rows, error: queryErr } = await query;
  if (queryErr) throw queryErr;
  if (!rows || rows.length === 0) {
    console.log(
      `No failed ai_calls rows for purpose~"${args.purpose}" in the last ${args.since}.`,
    );
    return;
  }

  // Group by the leading 60 chars of the error so drift modes cluster.
  const groups = new Map<string, number>();
  for (const row of rows) {
    const key = ((row as { error: string | null }).error ?? "").slice(0, 60);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  console.log(
    `\nFailed ai_calls — purpose~"${args.purpose}" since ${args.since}`,
  );
  console.log(`Total rows: ${rows.length}`);
  console.log(`User filter: ${args.userEmail ?? "(none)"}\n`);
  console.log("Top error clusters:");
  for (const [prefix, count] of [...groups.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${count.toString().padStart(4)}  ${prefix}…`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), "tmp", "ai-call-errors", stamp);
  await mkdir(outDir, { recursive: true });

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const filename = `${String(r.created_at).slice(0, 19).replace(/[:T]/g, "-")}-${r.id}.json`;
    const payload = {
      id: r.id,
      created_at: r.created_at,
      model: r.model,
      call_purpose: r.call_purpose,
      scope: {
        scope_table: r.scope_table,
        scope_id: r.scope_id,
        user_id: r.user_id,
      },
      output_tokens: r.output_tokens,
      latency_ms: r.latency_ms,
      error: r.error,
      system_prompt: r.system_prompt,
      user_prompt: r.user_prompt,
    };
    await writeFile(join(outDir, filename), JSON.stringify(payload, null, 2));
  }

  console.log(`\nDumped ${rows.length} row(s) to ${outDir}`);
  console.log(`Inspect with: ls "${outDir}"\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
