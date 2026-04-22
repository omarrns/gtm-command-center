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

// TheirStack fixture for Phase 2 — GTM discover-accounts. Three rows
// with firmographic fields populated so we can assert company_domain,
// trigger_signals, buyer_personas write back correctly.
const THEIRSTACK_FIXTURE = [
  {
    id: 9001,
    job_title: "VP of Sales",
    description: "Own pipeline and net-new logos.",
    date_posted: new Date().toISOString(),
    short_location: "San Francisco, CA",
    remote: false,
    seniority: "c_level",
    company: "NovaCore",
    company_domain: "novacore.io",
    company_object: {
      name: "NovaCore",
      domain: "novacore.io",
      linkedin_url: "https://linkedin.com/company/novacore",
      industry_id: 1234,
      employee_count: 185,
      annual_revenue_usd: 42000000,
      funding_stage: "series_b",
      country_code: "US",
    },
  },
  {
    id: 9002,
    job_title: "Head of Marketing",
    description: "Scale content + demand engine.",
    date_posted: new Date().toISOString(),
    short_location: "New York, NY",
    remote: false,
    seniority: "senior",
    company: "Formstack",
    company_domain: "formstack.example",
    company_object: {
      name: "Formstack",
      domain: "formstack.example",
      linkedin_url: "https://linkedin.com/company/formstack",
      industry_id: 5678,
      employee_count: 210,
      funding_stage: "series_b",
      country_code: "US",
    },
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

  if (url.includes("api.theirstack.com")) {
    return new Response(JSON.stringify({ data: THEIRSTACK_FIXTURE }), {
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
process.env.THEIRSTACK_API_KEY ||= "test-fixture-key";
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

  // ── GTM persona branch (Phase 2 gate) ───────────────────────────────────
  //
  // runPipeline reads profiles.user_type and dispatches to runGtmPipeline,
  // which loads the icp_rubric and calls TheirStack. The fetch stub above
  // returns 2 fixture jobs. Opportunities should land with source=
  // 'theirstack' and the GTM columns populated.
  console.log("\n--- GTM discover-accounts (theirstack) ---");
  const gtmUserId = "test-user-phase-2-gtm";
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
  tables.user_scoring_profiles.push({
    id: nextId(),
    user_id: gtmUserId,
    icp_rubric: {
      firmographics: {
        industries: ["B2B SaaS"],
        employee_range_min: 50,
        employee_range_max: 500,
        stages: ["Series B"],
        geographies: ["United States"],
      },
      technographics: {
        required_tools: ["Salesforce"],
        excluded_tools: [],
      },
      signals: {
        hiring_roles: ["VP of Sales", "Head of Marketing"],
        jtbd_evidence: [],
        trigger_events: [],
      },
      disqualifiers: [],
    },
  });

  const gtmResult = await runPipeline(svc, gtmUserId);
  const gtmOpps = tables.opportunities.filter((o) => o.user_id === gtmUserId);

  assert(
    gtmResult.error === null,
    `gtm result.error === null (got ${gtmResult.error})`,
  );
  assert(
    gtmResult.discover.found === 2,
    `gtm discover.found === 2 (got ${gtmResult.discover.found})`,
  );
  assert(
    gtmResult.discover.inserted === 2,
    `gtm discover.inserted === 2 (got ${gtmResult.discover.inserted})`,
  );
  assert(
    gtmOpps.length === 2,
    `gtm opportunities count === 2 (got ${gtmOpps.length})`,
  );
  assert(
    gtmOpps.every((o) => o.source === "theirstack"),
    "every gtm opportunity source === 'theirstack'",
  );
  assert(
    gtmOpps.every(
      (o) =>
        typeof o.company_domain === "string" && o.company_domain.length > 0,
    ),
    "every gtm opportunity has company_domain",
  );
  assert(
    gtmOpps.every(
      (o) => Array.isArray(o.trigger_signals) && o.trigger_signals.length > 0,
    ),
    "every gtm opportunity has trigger_signals",
  );
  assert(
    gtmOpps.every(
      (o) => Array.isArray(o.buyer_personas) && o.buyer_personas.length > 0,
    ),
    "every gtm opportunity has buyer_personas",
  );
  assert(
    gtmOpps.some((o) => o.company_name === "NovaCore"),
    "NovaCore opportunity present",
  );
  assert(
    gtmOpps.some(
      (o) =>
        o.company_name === "NovaCore" &&
        (o.trigger_signals as Record<string, unknown>[])[0]?.funding_stage ===
          "series_b",
    ),
    "NovaCore trigger_signals carries funding_stage='series_b'",
  );
  assert(
    gtmOpps.some(
      (o) =>
        o.company_name === "NovaCore" &&
        (o.buyer_personas as Record<string, unknown>[])[0]?.hiring_for ===
          "VP of Sales",
    ),
    "NovaCore buyer_personas carries hiring_for='VP of Sales'",
  );

  // Phase 3: score-accounts attempted for every TheirStack opportunity.
  // Exa + Anthropic are stubbed to 503 above, so scoring fails per-row —
  // the contract is that runScoreAccounts still claims and isolates each
  // error (not the whole run) and records last_error. If a future change
  // skips the scoring step entirely, processed will drop to 0.
  assert(
    gtmResult.score.processed === 2,
    `gtm score.processed === 2 (got ${gtmResult.score.processed})`,
  );
  assert(
    gtmResult.score.errors === 2,
    `gtm score.errors === 2 under stubbed exa/anthropic (got ${gtmResult.score.errors})`,
  );
  assert(
    gtmOpps.every((o) => typeof o.last_error === "string"),
    "every gtm opportunity has last_error recorded from stubbed scoring",
  );
  const jobSeekerOpps = tables.opportunities.filter(
    (o) => o.user_id === userId,
  );
  assert(
    jobSeekerOpps.length === 3,
    `job_seeker opportunities unaffected by gtm run (got ${jobSeekerOpps.length})`,
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
