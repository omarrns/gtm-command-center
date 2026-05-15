#!/usr/bin/env tsx
/**
 * Regression gate for disabled-user background processing.
 *
 * Disabled or missing profiles must not be selected by service-role cron and
 * webhook paths, even when work rows still exist for that user.
 */

import { config } from "dotenv";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __setSupabaseServiceClientForTests } from "../src/lib/supabase/service";

config({ path: ".env.local" });

process.env.CRON_SECRET = "test-cron-secret";
process.env.THEIRSTACK_WEBHOOK_SIGNING_SECRET = "test-webhook-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://stub.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "stub-service-key";
delete process.env.EXA_API_KEY;

interface MockRow {
  [key: string]: unknown;
}

interface MockError {
  message: string;
}

interface QueryResult {
  data: MockRow[] | MockRow | null;
  error: MockError | null;
}

interface QueryChain {
  select(fields?: string): QueryChain;
  eq(field: string, value: unknown): QueryChain;
  in(field: string, values: unknown[]): QueryChain;
  not(field: string, operator: string, value: unknown): QueryChain;
  maybeSingle(): { data: MockRow | null; error: null };
  single(): { data: MockRow | null; error: MockError | null };
  then<TResult1 = QueryResult, TResult2 = never>(
    onFulfill?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onReject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

const tables: Record<string, MockRow[]> = {
  profiles: [],
  opportunities: [],
  watchlist: [],
  user_scoring_profiles: [],
  pipeline_config: [],
  gmail_credentials: [],
};
const queryLog: string[] = [];

function resetTables(rows: Partial<Record<string, MockRow[]>>) {
  for (const table of Object.keys(tables)) {
    const nextRows = rows[table];
    tables[table] = nextRows ? [...nextRows] : [];
  }
  queryLog.length = 0;
}

function countQueries(table: string): number {
  return queryLog.filter((entry) => entry === table).length;
}

function pick(row: MockRow, fields: string): MockRow {
  if (fields === "*") return { ...row };
  const result: MockRow = {};
  for (const field of fields.split(",").map((s) => s.trim())) {
    result[field] = row[field];
  }
  return result;
}

function createMockSupabase(): SupabaseClient {
  function buildQuery(table: string): QueryChain {
    queryLog.push(table);
    const filters: Array<(row: MockRow) => boolean> = [];
    let selectFields = "*";

    let chain: QueryChain;
    chain = {
      select(fields?: string) {
        selectFields = fields ?? "*";
        return chain;
      },
      eq(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
        return chain;
      },
      in(field: string, values: unknown[]) {
        filters.push((row) => values.includes(row[field]));
        return chain;
      },
      not(field: string, operator: string, value: unknown) {
        if (operator === "is" && value === null) {
          filters.push((row) => row[field] !== null);
        }
        return chain;
      },
      maybeSingle() {
        const rows = resolveRows();
        return { data: rows[0] ?? null, error: null };
      },
      single() {
        const rows = resolveRows();
        if (!rows[0]) {
          return { data: null, error: { message: "No rows found" } };
        }
        return { data: rows[0], error: null };
      },
      then<TResult1 = QueryResult, TResult2 = never>(
        onFulfill?:
          | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
          | null,
        onReject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        try {
          return Promise.resolve({ data: resolveRows(), error: null }).then(
            onFulfill,
            onReject,
          );
        } catch (err) {
          return onReject
            ? Promise.resolve(onReject(err))
            : Promise.reject(err);
        }
      },
    };

    function resolveRows(): MockRow[] {
      return (tables[table] ?? [])
        .filter((row) => filters.every((filter) => filter(row)))
        .map((row) => pick(row, selectFields));
    }

    return chain;
  }

  return {
    from(table: string) {
      return buildQuery(table);
    },
  } as unknown as SupabaseClient;
}

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failures++;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

function cronRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function signWebhook(body: string): string {
  const secret =
    process.env.THEIRSTACK_WEBHOOK_SIGNING_SECRET ?? "test-webhook-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
}

function disabledProfile(userId: string, userType: "job_seeker" | "gtm") {
  return { user_id: userId, user_type: userType, is_enabled: false };
}

async function main() {
  console.log("Disabled-user background gates");
  console.log("================================\n");

  __setSupabaseServiceClientForTests(() => createMockSupabase());

  const dormant = await import("../src/app/api/cron/dormant-discover/route");
  const replies = await import("../src/app/api/cron/replies/route");
  const watchlist = await import("../src/app/api/cron/watchlist/route");
  const webhook = await import("../src/app/api/webhooks/theirstack/route");

  resetTables({
    profiles: [disabledProfile("disabled-gtm", "gtm")],
  });
  const dormantRes = await dormant.GET(cronRequest("/api/cron/dormant-discover"));
  const dormantBody = (await dormantRes.json()) as { users?: number };
  assert(dormantRes.status === 200, "dormant-discover returns 200");
  assert(dormantBody.users === 0, "dormant-discover sees zero enabled users");
  assert(
    countQueries("user_scoring_profiles") === 0,
    "dormant-discover does not load rubrics for disabled users",
  );
  assert(
    countQueries("pipeline_config") === 0,
    "dormant-discover does not load config for disabled users",
  );

  resetTables({
    profiles: [disabledProfile("disabled-replies", "job_seeker")],
    opportunities: [
      {
        id: "sent-disabled-1",
        user_id: "disabled-replies",
        stage: "sent",
        gmail_thread_id: "thread-disabled",
        gmail_message_id: "message-disabled",
      },
    ],
  });
  const repliesRes = await replies.GET(cronRequest("/api/cron/replies"));
  const repliesBody = (await repliesRes.json()) as { checked?: number };
  assert(repliesRes.status === 200, "replies returns 200");
  assert(repliesBody.checked === 0, "replies checks zero disabled threads");
  assert(
    countQueries("gmail_credentials") === 0,
    "replies does not load Gmail credentials for disabled users",
  );

  resetTables({
    profiles: [disabledProfile("disabled-watchlist", "job_seeker")],
    watchlist: [{ user_id: "disabled-watchlist", webset_id: "webset-disabled" }],
  });
  const watchlistRes = await watchlist.GET(cronRequest("/api/cron/watchlist"));
  const watchlistBody = (await watchlistRes.json()) as { users?: number };
  assert(watchlistRes.status === 200, "watchlist returns 200");
  assert(watchlistBody.users === 0, "watchlist processes zero disabled users");
  assert(
    countQueries("watchlist") === 1,
    "watchlist does not call processWatchlistAlerts for disabled users",
  );

  resetTables({
    profiles: [disabledProfile("disabled-webhook", "gtm")],
  });
  const webhookBody = JSON.stringify({
    type: "job.new",
    job: {
      id: "disabled-webhook-job",
      job_title: "VP Sales",
      description: "Own pipeline.",
      date_posted: new Date().toISOString(),
      company: "DisabledCo",
      company_domain: "disabled.example",
      company_object: {
        name: "DisabledCo",
        domain: "disabled.example",
        funding_stage: "series_a",
      },
    },
  });
  const webhookRes = await webhook.POST(
    new Request(
      "http://localhost/api/webhooks/theirstack?user=disabled-webhook",
      {
        method: "POST",
        body: webhookBody,
        headers: { "x-theirstack-signature-256": signWebhook(webhookBody) },
      },
    ),
  );
  const webhookJson = (await webhookRes.json()) as { skipped?: string };
  assert(webhookRes.status === 200, "webhook returns 200 for disabled users");
  assert(
    webhookJson.skipped === "user disabled",
    "webhook returns disabled skip reason",
  );
  assert(
    countQueries("user_scoring_profiles") === 0,
    "webhook does not load rubrics for disabled users",
  );
  assert(
    countQueries("pipeline_config") === 0,
    "webhook does not load config for disabled users",
  );

  __setSupabaseServiceClientForTests(null);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  __setSupabaseServiceClientForTests(null);
  console.error(err);
  process.exit(1);
});
