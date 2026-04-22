#!/usr/bin/env tsx
/**
 * Phase 0 regression gate — SPEC-4 ICP pipeline.
 *
 * Guards the job_seeker pipeline path before Phase 1 persona routing
 * lands in src/lib/pipeline/runner.ts. If Phase 1 accidentally skips
 * runDiscover for job_seeker users, this test catches it.
 *
 * Strategy:
 *   - In-memory Supabase mock (no real DB)
 *   - Global fetch stub: JSearch → fixture jobs; Anthropic / Exa → 503
 *     so downstream stages fail deterministically with isolated errors
 *   - Seeds pipeline_config (profile row unused today — runPipeline does
 *     not read user_type yet; Phase 1 will, and this test will still pass)
 *   - Calls runPipeline(svc, userId) end-to-end
 *   - Asserts runDiscover produced 3 opportunities with correct fields
 *     and the runner returned a well-formed result
 *
 * Run: npm run test:pipeline-regression
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "dotenv";
config({ path: ".env.local" });

// ── Global fetch stub ──────────────────────────────────────────────────────

const JSEARCH_FIXTURE = [
  {
    job_id: "fixture-job-1",
    job_title: "GTM Engineer",
    employer_name: "AcmeCo",
    job_city: "San Francisco",
    job_state: "CA",
    job_country: "us",
    job_is_remote: false,
    job_apply_link: "https://acme.example/jobs/1",
    job_description: "Build pipeline. Ship fast.",
    job_employment_type: "FULLTIME",
    job_min_salary: null,
    job_max_salary: null,
    job_salary_currency: null,
    job_salary_period: null,
    job_posted_at_datetime_utc: new Date().toISOString(),
    job_required_skills: ["TypeScript", "Node"],
    job_highlights: null,
  },
  {
    job_id: "fixture-job-2",
    job_title: "Growth Engineer",
    employer_name: "BetaCorp",
    job_city: "Remote",
    job_state: null,
    job_country: "us",
    job_is_remote: true,
    job_apply_link: "https://beta.example/jobs/2",
    job_description: "Growth loops, funnels, experiments.",
    job_employment_type: "FULLTIME",
    job_min_salary: null,
    job_max_salary: null,
    job_salary_currency: null,
    job_salary_period: null,
    job_posted_at_datetime_utc: new Date().toISOString(),
    job_required_skills: ["SQL", "Python"],
    job_highlights: null,
  },
  {
    job_id: "fixture-job-3",
    job_title: "GTM Engineer",
    employer_name: "GammaLabs",
    job_city: "New York",
    job_state: "NY",
    job_country: "us",
    job_is_remote: false,
    job_apply_link: "https://gamma.example/jobs/3",
    job_description: "Automation-first revenue org.",
    job_employment_type: "FULLTIME",
    job_min_salary: null,
    job_max_salary: null,
    job_salary_currency: null,
    job_salary_period: null,
    job_posted_at_datetime_utc: new Date().toISOString(),
    job_required_skills: ["Claude", "Zapier"],
    job_highlights: null,
  },
];

const originalFetch = globalThis.fetch;
let jsearchCallCount = 0;

globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();

  if (url.includes("jsearch.p.rapidapi.com")) {
    jsearchCallCount++;
    // Return the full fixture on the first call; empty on subsequent calls
    // (queries×locations loop) so we deduplicate to exactly 3 results.
    const data = jsearchCallCount === 1 ? JSEARCH_FIXTURE : [];
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  }

  // Any other outbound call (Anthropic, Exa, etc.) is intentionally
  // failed so score/research/enrich/draft fail with isolated per-opp
  // errors. Phase 0 does not assert downstream stage success — only
  // that runDiscover creates opportunities and runPipeline returns
  // without throwing.
  return new Response('{"error":"stubbed-in-test"}', {
    status: 503,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}) as typeof fetch;

// Required env for jsearch.ts assertEnv + score prompt assertEnv checks.
process.env.RAPIDAPI_KEY ||= "test-fixture-key";
process.env.ANTHROPIC_API_KEY ||= "test-fixture-key";
process.env.EXA_API_KEY ||= "test-fixture-key";

// ── In-memory Supabase mock ───────────────────────────────────────────────

interface MockRow {
  [key: string]: any;
}

const tables: Record<string, MockRow[]> = {
  pipeline_config: [],
  profiles: [],
  opportunities: [],
  analyses: [],
  research_reports: [],
  email_drafts: [],
  watchlist: [],
  memory_documents: [],
  user_scoring_profiles: [],
};

let idCounter = 0;
function nextId(): string {
  return `mock-${++idCounter}`;
}

function pick(row: MockRow, fields: string): MockRow {
  if (fields === "*") return { ...row };
  const result: MockRow = {};
  for (const f of fields.split(",").map((s) => s.trim())) {
    result[f] = row[f];
  }
  return result;
}

function createMockSupabase(): any {
  function buildQuery(table: string) {
    const filters: Array<(row: MockRow) => boolean> = [];
    let selectFields: string | null = null;
    let limitCount: number | null = null;
    let orderField: string | null = null;
    let orderAsc = true;
    let isSingle = false;
    let isMaybeSingle = false;
    let pendingUpsert: {
      row: MockRow;
      onConflict: string;
      ignoreDuplicates: boolean;
    } | null = null;
    let pendingInsert: MockRow | null = null;
    let pendingUpdate: Partial<MockRow> | null = null;

    const chain: any = {
      select(fields?: string) {
        selectFields = fields ?? "*";
        return chain;
      },
      eq(field: string, value: any) {
        filters.push((row) => row[field] === value);
        return chain;
      },
      not(field: string, op: string, value: any) {
        if (op === "is" && value === null) {
          filters.push((row) => row[field] != null);
        }
        return chain;
      },
      is(field: string, value: any) {
        filters.push((row) => row[field] === value);
        return chain;
      },
      in(field: string, values: any[]) {
        filters.push((row) => values.includes(row[field]));
        return chain;
      },
      or() {
        // The only or() use in runDiscover flow is the stale-claim
        // check; both arms select the rows we want for the test so we
        // no-op the filter.
        return chain;
      },
      gte(field: string, value: any) {
        filters.push((row) => row[field] >= value);
        return chain;
      },
      lte(field: string, value: any) {
        filters.push((row) => row[field] <= value);
        return chain;
      },
      ilike(field: string, value: string) {
        const pattern = value.replace(/%/g, "").toLowerCase();
        filters.push((row) =>
          (row[field] ?? "").toLowerCase().includes(pattern),
        );
        return chain;
      },
      order(field: string, opts?: { ascending?: boolean }) {
        orderField = field;
        orderAsc = opts?.ascending ?? true;
        return chain;
      },
      limit(n: number) {
        limitCount = n;
        return chain;
      },
      range(start: number, end: number) {
        limitCount = end - start + 1;
        return chain;
      },
      single() {
        isSingle = true;
        return resolve();
      },
      maybeSingle() {
        isMaybeSingle = true;
        return resolve();
      },
    };

    function withInsertDefaults(row: MockRow): MockRow {
      if (table !== "opportunities") return row;
      return {
        stage: "discovered",
        discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        processing_started_at: null,
        attempt_count: 0,
        enrichment_attempts: 0,
        max_enrichment_attempts: 3,
        score: null,
        ...row,
      };
    }

    function resolve(): { data: any; error: any } {
      if (pendingInsert) {
        const row = withInsertDefaults({
          ...pendingInsert,
          id: pendingInsert.id ?? nextId(),
        });
        tables[table].push(row);
        if (isSingle || isMaybeSingle) {
          return {
            data: selectFields ? pick(row, selectFields) : row,
            error: null,
          };
        }
        return {
          data: [selectFields ? pick(row, selectFields) : row],
          error: null,
        };
      }

      if (pendingUpsert) {
        const conflictFields = pendingUpsert.onConflict.split(",");
        const existing = tables[table].find((r) =>
          conflictFields.every((f) => r[f] === pendingUpsert!.row[f]),
        );
        if (existing && pendingUpsert.ignoreDuplicates) {
          if (isSingle || isMaybeSingle) return { data: null, error: null };
          return { data: [], error: null };
        }
        if (existing) {
          Object.assign(existing, pendingUpsert.row);
          if (isSingle || isMaybeSingle)
            return {
              data: selectFields ? pick(existing, selectFields) : existing,
              error: null,
            };
          return {
            data: [selectFields ? pick(existing, selectFields) : existing],
            error: null,
          };
        }
        const row = withInsertDefaults({
          ...pendingUpsert.row,
          id: pendingUpsert.row.id ?? nextId(),
        });
        tables[table].push(row);
        if (isSingle || isMaybeSingle)
          return {
            data: selectFields ? pick(row, selectFields) : row,
            error: null,
          };
        return {
          data: [selectFields ? pick(row, selectFields) : row],
          error: null,
        };
      }

      if (pendingUpdate) {
        const rows = tables[table].filter((row) =>
          filters.every((f) => f(row)),
        );
        for (const row of rows) {
          Object.assign(row, pendingUpdate);
        }
        if (isSingle || isMaybeSingle) {
          return {
            data: rows[0]
              ? selectFields
                ? pick(rows[0], selectFields)
                : rows[0]
              : null,
            error: null,
          };
        }
        return {
          data: rows.map((r) => (selectFields ? pick(r, selectFields) : r)),
          error: null,
        };
      }

      // SELECT
      let rows = tables[table].filter((row) => filters.every((f) => f(row)));
      if (orderField) {
        const f = orderField;
        rows.sort((a, b) => {
          const cmp = a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitCount != null) rows = rows.slice(0, limitCount);

      if (isSingle || isMaybeSingle) {
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

    return {
      chain,
      setInsert: (row: MockRow) => {
        pendingInsert = row;
      },
      setUpdate: (row: Partial<MockRow>) => {
        pendingUpdate = row;
      },
      setUpsert: (
        row: MockRow,
        onConflict: string,
        ignoreDuplicates: boolean,
      ) => {
        pendingUpsert = { row, onConflict, ignoreDuplicates };
      },
    };
  }

  const client: any = {
    from(table: string) {
      const q = buildQuery(table);
      return {
        select: q.chain.select,
        insert(row: MockRow) {
          q.setInsert(row);
          return q.chain;
        },
        upsert(
          row: MockRow,
          opts: { onConflict: string; ignoreDuplicates?: boolean },
        ) {
          q.setUpsert(row, opts.onConflict, opts.ignoreDuplicates ?? false);
          return q.chain;
        },
        update(row: Partial<MockRow>) {
          q.setUpdate(row);
          return q.chain;
        },
      };
    },
    rpc(name: string, params: any) {
      if (name === "claim_opportunity") {
        const opp = tables.opportunities.find(
          (r) => r.id === params.p_id && r.user_id === params.p_user_id,
        );
        if (!opp) return Promise.resolve({ data: false, error: null });
        if (opp.processing_started_at) {
          const stale =
            new Date(opp.processing_started_at).getTime() <
            Date.now() - 10 * 60 * 1000;
          if (!stale) return Promise.resolve({ data: false, error: null });
        }
        opp.processing_started_at = new Date().toISOString();
        opp.attempt_count = (opp.attempt_count ?? 0) + 1;
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "reserve_send_slot") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: `Unknown RPC: ${name}` },
      });
    },
  };

  return client;
}

// ── Assertions ────────────────────────────────────────────────────────────

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failures++;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

// ── Test ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("Phase 0 — Pipeline regression gate (job_seeker path)");
  console.log("===================================================");

  const svc = createMockSupabase();
  const userId = "test-user-phase-0";

  // Seed pipeline_config
  tables.pipeline_config.push({
    id: nextId(),
    user_id: userId,
    search_queries: ["GTM Engineer"],
    search_locations: ["San Francisco"],
    score_threshold: 70,
    daily_send_cap: 10,
    activation_completed_at: new Date().toISOString(),
  });

  // Seed profile (ignored by runPipeline today; Phase 1 will read it)
  tables.profiles.push({
    id: nextId(),
    user_id: userId,
    email: "test@example.com",
    user_type: "job_seeker",
  });

  // Dynamic import AFTER the fetch stub is installed so jsearch.ts picks it up.
  const { runPipeline } = await import("../src/lib/pipeline/runner");

  const result = await runPipeline(svc, userId);

  console.log("\n--- Result shape ---");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n--- Assertions ---");

  // Discover assertions: Phase 1's regression target.
  assert(
    result.discover.found === 3,
    `discover.found === 3 (got ${result.discover.found})`,
  );
  assert(
    result.discover.inserted === 3,
    `discover.inserted === 3 (got ${result.discover.inserted})`,
  );

  // Opportunities table shape
  const opps = tables.opportunities;
  assert(opps.length === 3, `opportunities count === 3 (got ${opps.length})`);
  assert(
    opps.every((o) => o.user_id === userId),
    "every opportunity scoped to test user",
  );
  assert(
    opps.every((o) => o.source === "jsearch"),
    "every opportunity source === 'jsearch'",
  );
  assert(
    opps.some((o) => o.company_name === "AcmeCo"),
    "AcmeCo opportunity present",
  );
  assert(
    opps.some((o) => o.company_name === "BetaCorp"),
    "BetaCorp opportunity present",
  );
  assert(
    opps.some((o) => o.company_name === "GammaLabs"),
    "GammaLabs opportunity present",
  );
  assert(
    opps.every(
      (o) => typeof o.external_id === "string" && o.external_id.length > 0,
    ),
    "every opportunity has external_id",
  );
  assert(
    opps.every((o) => o.stage === "discovered"),
    "every opportunity at stage='discovered' (score stubbed to 503)",
  );

  // Runner returns a well-formed result even though downstream stages
  // failed against the 503 stub. Pipeline error isolation catches the
  // downstream failures; the runner itself does not throw.
  assert(
    typeof result.score.processed === "number",
    "result.score.processed is numeric (runScore executed cleanly)",
  );
  assert(
    typeof result.research.processed === "number",
    "result.research.processed is numeric",
  );
  assert(
    typeof result.enrich.processed === "number",
    "result.enrich.processed is numeric",
  );
  assert(
    typeof result.draft.processed === "number",
    "result.draft.processed is numeric",
  );
  assert(
    typeof result.queuedRecovery === "number",
    "result.queuedRecovery is numeric",
  );

  // ── GTM persona branch (Phase 1 gate) ───────────────────────────────────
  //
  // runPipeline reads profiles.user_type and routes. For a gtm user the
  // stub runner must complete without producing rows or errors. If a later
  // phase accidentally wires the job_seeker stages into the gtm path this
  // check catches it.
  console.log("\n--- GTM persona no-op ---");
  const gtmUserId = "test-user-phase-1-gtm";
  tables.pipeline_config.push({
    id: nextId(),
    user_id: gtmUserId,
    search_queries: [],
    search_locations: [],
    score_threshold: 70,
    daily_send_cap: 10,
    activation_completed_at: new Date().toISOString(),
  });
  tables.profiles.push({
    id: nextId(),
    user_id: gtmUserId,
    email: "gtm@example.com",
    user_type: "gtm",
  });

  const gtmResult = await runPipeline(svc, gtmUserId);
  const gtmOpps = tables.opportunities.filter((o) => o.user_id === gtmUserId);

  assert(
    gtmResult.discover.inserted === 0,
    `gtm discover.inserted === 0 (got ${gtmResult.discover.inserted})`,
  );
  assert(
    gtmOpps.length === 0,
    `gtm opportunities count === 0 (got ${gtmOpps.length})`,
  );
  assert(
    gtmResult.error === null,
    `gtm result.error === null (got ${gtmResult.error})`,
  );
  assert(
    opps.length === 3,
    `job_seeker opportunities unaffected by gtm run (got ${opps.length})`,
  );

  console.log("\n===================================================");
  if (failures > 0) {
    console.error(`FAILED: ${failures} assertion(s) did not pass`);
    process.exitCode = 1;
  } else {
    console.log("PASSED: regression gate green on current runner behavior");
  }

  globalThis.fetch = originalFetch;
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exitCode = 1;
});
