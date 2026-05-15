#!/usr/bin/env tsx
/**
 * Regression gate for dispatch-time persona filtering.
 *
 * The workflow keeps its own GTM short-circuit safety net. This test locks in
 * the cheaper route-level behavior: cron must not start workflow runs for GTM
 * users, and the manual trigger must return actionable feedback for GTM users.
 *
 * Run: npm run test:pipeline-dispatch-persona
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __setSupabaseServiceClientForTests } from "../src/lib/supabase/service";

config({ path: ".env.local" });

interface MockRow {
  [key: string]: any;
}

const tables: Record<string, MockRow[]> = {
  pipeline_config: [],
  profiles: [],
};

let idCounter = 0;
function nextId(): string {
  return `mock-${++idCounter}`;
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
  function buildQuery(table: string) {
    const filters: Array<(row: MockRow) => boolean> = [];
    let selectFields = "*";
    let isMaybeSingle = false;

    const chain: any = {
      select(fields?: string) {
        selectFields = fields ?? "*";
        return chain;
      },
      eq(field: string, value: any) {
        filters.push((row) => row[field] === value);
        return chain;
      },
      in(field: string, values: any[]) {
        filters.push((row) => values.includes(row[field]));
        return chain;
      },
      maybeSingle() {
        isMaybeSingle = true;
        return resolve();
      },
    };

    function resolve(): { data: any; error: any } {
      const rows = tables[table]
        .filter((row) => filters.every((f) => f(row)))
        .map((row) => pick(row, selectFields));
      if (isMaybeSingle) {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    }

    chain.then = (onFulfill: any, onReject?: any) => {
      try {
        return Promise.resolve(resolve()).then(onFulfill, onReject);
      } catch (err) {
        return onReject ? Promise.resolve(onReject(err)) : Promise.reject(err);
      }
    };

    return chain;
  }

  const client: any = {
    from(table: string) {
      const query = buildQuery(table);
      return {
        select: query.select,
      };
    },
  };

  return client as SupabaseClient;
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

async function main() {
  console.log("Pipeline dispatch persona regression");
  console.log("====================================");

  process.env.CRON_SECRET = "test-cron-secret";
  const svc = createMockSupabase();
  __setSupabaseServiceClientForTests(() => svc);

  seedUser("dispatch-job-seeker", "job_seeker", true);
  seedUser("dispatch-gtm", "gtm", true);
  seedUser("dispatch-null", null, true);
  seedUser("dispatch-disabled", "job_seeker", false);

  const cronRoute = await import("../src/app/api/cron/pipeline/route");
  const pipelineRunRoute = await import("../src/app/api/pipeline/run/route");

  const startedUsers: string[] = [];
  cronRoute.__setStartWorkflowForTests((async (_workflow: any, args: any[]) => {
    startedUsers.push(args[0]);
    return { runId: `workflow-${args[0]}` };
  }) as any);

  const cronRes = await cronRoute.GET(
    new Request("http://localhost/api/cron/pipeline", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
  );
  const cronBody = await cronRes.json();

  console.log("\n--- cron dispatch ---");
  assert(cronRes.status === 200, `cron status === 200 (got ${cronRes.status})`);
  assert(
    startedUsers.length === 2 &&
      startedUsers.includes("dispatch-job-seeker") &&
      startedUsers.includes("dispatch-null"),
    `job_seeker and null user_type dispatched (got ${JSON.stringify(startedUsers)})`,
  );
  assert(
    cronBody.processed === 2,
    `cron processed === 2 dispatched users (got ${cronBody.processed})`,
  );
  assert(
    cronBody.skippedGtm === 1,
    `cron skippedGtm === 1 (got ${cronBody.skippedGtm})`,
  );
  assert(
    cronBody.skippedDisabled === 1,
    `cron skippedDisabled === 1 (got ${cronBody.skippedDisabled})`,
  );

  let manualStarted = false;
  pipelineRunRoute.__setPipelineRunRouteDepsForTests({
    start: (async () => {
      manualStarted = true;
      return { runId: "manual-should-not-start" };
    }) as any,
    requireUser: (async () =>
      ({
        id: "dispatch-gtm",
        email: "gtm@example.com",
      }) as any) as any,
  });

  const manualRes = await pipelineRunRoute.POST();
  const manualBody = await manualRes.json();

  console.log("\n--- manual dispatch ---");
  assert(
    manualRes.status === 400,
    `manual status === 400 for gtm (got ${manualRes.status})`,
  );
  assert(
    manualBody.err ===
      "Manual pipeline trigger is for job_seeker persona. GTM users are served by /api/cron/dormant-discover and the TheirStack webhook.",
    "manual gtm response has expected error message",
  );
  assert(!manualStarted, "manual gtm trigger did not call workflow start");

  pipelineRunRoute.__setPipelineRunRouteDepsForTests(null);
  manualStarted = false;
  pipelineRunRoute.__setPipelineRunRouteDepsForTests({
    start: (async () => {
      manualStarted = true;
      return { runId: "manual-null-started" };
    }) as any,
    requireUser: (async () =>
      ({
        id: "dispatch-null",
        email: "null-user-type@example.com",
      }) as any) as any,
  });

  const nullManualRes = await pipelineRunRoute.POST();
  const nullManualBody = await nullManualRes.json();

  console.log("\n--- manual dispatch (null user_type) ---");
  assert(
    nullManualRes.status === 202,
    `manual status === 202 for null user_type (got ${nullManualRes.status})`,
  );
  assert(
    nullManualBody.ok === true,
    `manual null user_type response ok === true (got ${nullManualBody.ok})`,
  );
  assert(manualStarted, "manual null user_type trigger called workflow start");

  cronRoute.__setStartWorkflowForTests(null);
  pipelineRunRoute.__setPipelineRunRouteDepsForTests(null);
  __setSupabaseServiceClientForTests(null);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

function seedUser(
  userId: string,
  userType: "job_seeker" | "gtm" | null,
  isEnabled: boolean,
) {
  tables.pipeline_config.push({
    id: nextId(),
    user_id: userId,
  });
  tables.profiles.push({
    id: nextId(),
    user_id: userId,
    user_type: userType,
    is_enabled: isEnabled,
  });
}

main().catch((err) => {
  __setSupabaseServiceClientForTests(null);
  console.error(err);
  process.exit(1);
});
