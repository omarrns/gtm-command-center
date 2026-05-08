#!/usr/bin/env tsx
/**
 * Phase 0 regression gate — SPEC-4 ICP pipeline.
 *
 * Guards the job_seeker workflow path. If routing accidentally skips
 * runDiscover for job_seeker users, this test catches it.
 *
 * Strategy:
 *   - In-memory Supabase mock (no real DB)
 *   - Global fetch stub: JSearch → fixture jobs; Anthropic / Exa → 503
 *     so downstream stages fail deterministically with isolated errors
 *   - Seeds pipeline_config and a job_seeker profile row
 *   - Calls pipelineWorkflow(userId, runId) through the service-client test override
 *   - Asserts runDiscover produced 3 opportunities with correct fields
 *     and the workflow returned a well-formed result
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
  // Codex audit #2: a TheirStack row with no resolvable domain must be
  // skipped by runDiscoverAccounts rather than inserted — dormant dedup
  // and the scoring prompt both assume non-null company_domain.
  {
    id: 9003,
    job_title: "Founding Engineer",
    description: "Pre-seed stealth; no public domain yet.",
    date_posted: new Date().toISOString(),
    short_location: "Remote",
    remote: true,
    seniority: "senior",
    company: "StealthCo",
    company_domain: null,
    company_object: {
      name: "StealthCo",
      domain: null,
      funding_stage: "seed",
      country_code: "US",
    },
  },
];

// Phase 4 dormant-ICP fixture. Three Exa search results; one overlaps
// with the TheirStack company_domain set so runDiscoverDormant's dedup
// path is exercised.
const EXA_DORMANT_FIXTURE = [
  {
    title: "Formstack | Revenue ops platform",
    url: "https://formstack.example/about",
    text: "Formstack is a revenue operations platform for B2B SaaS.",
  },
  {
    title: "NewDormant — Series B data infra",
    url: "https://newdormant.io",
    text: "NewDormant builds data infrastructure for Series B companies.",
  },
  {
    title: "AnotherDormant",
    url: "https://anotherdormant.io/company",
    text: "AnotherDormant is a GTM tooling company.",
  },
];

const originalFetch = globalThis.fetch;
let jsearchCallCount = 0;
// When true, the global fetch stub returns EXA_DORMANT_FIXTURE for
// /search calls. Stays false during Phase 3 scoring so exaFindCompany
// 503s on purpose (keeps per-opp error isolation assertions stable);
// flipped to true right before Phase 4's runDiscoverDormant call.
let exaReturnsDormantFixture = false;
// Same toggle for the activation clamp regression: lets exaFindCompany
// resolve to empty results (200, no error) so scoreAccountAgainstIcp
// reaches runGenerateObject under the canned-analysis stub.
let exaReturnsEmpty = false;
let theirStackCallCount = 0;

globalThis.fetch = (async (input: any, init?: RequestInit) => {
  void init;
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
    theirStackCallCount++;
    return new Response(JSON.stringify({ data: THEIRSTACK_FIXTURE }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  }

  if (url.includes("api.exa.ai/search") && exaReturnsDormantFixture) {
    return new Response(JSON.stringify({ results: EXA_DORMANT_FIXTURE }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  }

  if (url.includes("api.exa.ai/search") && exaReturnsEmpty) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  }

  // Any other outbound call (Anthropic, Exa scoring lookups, etc.) is
  // intentionally failed so score/research/enrich/draft fail with
  // isolated per-opp errors. The runner still returns a structured
  // result — that's what we're gating on for the job_seeker path.
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

  // Seed profile so the live workflow takes the job_seeker path.
  tables.profiles.push({
    id: nextId(),
    user_id: userId,
    email: "test@example.com",
    user_type: "job_seeker",
  });

  // Dynamic imports AFTER the fetch stub is installed so jsearch.ts picks it up.
  const { __setSupabaseServiceClientForTests } = await import("../src/lib/supabase/service");
  __setSupabaseServiceClientForTests(() => svc);
  const { pipelineWorkflow } = await import("../src/lib/pipeline/workflow");

  const result = await pipelineWorkflow(userId, "test-run-phase-0");

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

  // Workflow returns a well-formed result even though downstream stages
  // failed against the 503 stub. Pipeline error isolation catches the
  // downstream failures; the workflow itself does not throw.
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
  // The GTM batch runner loads the icp_rubric and calls TheirStack. The
  // fetch stub above returns 2 insertable fixture jobs. Opportunities should
  // land with source='theirstack' and the GTM columns populated.
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
        employee_range: { min: 50, max: 500 },
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
      disqualifiers: {
        tech_disqualifiers: [],
        size_disqualifiers: "",
        stage_disqualifiers: [],
        behavioral_disqualifiers: [],
      },
    },
  });

  // Codex audit #1: simulate persona-switch cruft — 10 stale jsearch
  // rows at stage='discovered' for this GTM user. Without the
  // in-query source filter, getOpportunitiesByStage's LIMIT 10 window
  // would be consumed by these rows and TheirStack accounts would
  // never reach the scorer. With the fix, the query excludes them
  // and the 2 TheirStack rows are processed normally.
  const staleSeedTime = new Date(
    Date.now() - 12 * 60 * 60 * 1000,
  ).toISOString();
  for (let i = 0; i < 10; i++) {
    tables.opportunities.push({
      id: nextId(),
      user_id: gtmUserId,
      source: "jsearch",
      external_id: `stale-jsearch-${i}`,
      company_name: `StaleCo ${i}`,
      role_title: "Any Role",
      stage: "discovered",
      discovered_at: staleSeedTime,
      updated_at: staleSeedTime,
      processing_started_at: null,
      attempt_count: 0,
      enrichment_attempts: 0,
      max_enrichment_attempts: 3,
      score: null,
    });
  }

  const { runGtmPipeline } = await import("../src/lib/pipeline/gtm-runner");
  const gtmResult = await runGtmPipeline(svc, gtmUserId);
  // Scope assertions to TheirStack rows only — the 10 stale jsearch
  // seeds from the starvation fixture live in the same user's opps.
  const gtmOpps = tables.opportunities.filter(
    (o) => o.user_id === gtmUserId && o.source === "theirstack",
  );

  assert(
    gtmResult.error === null,
    `gtm result.error === null (got ${gtmResult.error})`,
  );
  assert(
    gtmResult.discover.found === 3,
    `gtm discover.found === 3 from theirstack fixture (got ${gtmResult.discover.found})`,
  );
  // Codex audit #2: the 3rd fixture row (StealthCo) has company_domain=null
  // and must be skipped by runDiscoverAccounts. Inserted stays at 2.
  assert(
    gtmResult.discover.inserted === 2,
    `gtm discover.inserted === 2 (null-domain row skipped) (got ${gtmResult.discover.inserted})`,
  );
  assert(
    gtmOpps.length === 2,
    `gtm opportunities count === 2 (got ${gtmOpps.length})`,
  );
  assert(
    !gtmOpps.some((o) => o.company_name === "StealthCo"),
    "StealthCo (no domain) NOT inserted — null-domain guardrail enforced",
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
    "every gtm opportunity has non-null company_domain",
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
    `gtm score.processed === 2 — 10 stale jsearch rows did NOT starve the GTM scorer (got ${gtmResult.score.processed})`,
  );
  // Codex audit #1: the stale jsearch rows must remain untouched —
  // still at stage='discovered', unclaimed, unscored.
  const staleRowsAfter = tables.opportunities.filter(
    (o) => o.user_id === gtmUserId && o.source === "jsearch",
  );
  assert(
    staleRowsAfter.length === 10,
    `10 stale jsearch rows still present (got ${staleRowsAfter.length})`,
  );
  assert(
    staleRowsAfter.every((o) => o.stage === "discovered" && o.score === null),
    "stale jsearch rows NOT touched by GTM scorer (still discovered + unscored)",
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

  // ── Phase 4: dormant-ICP discovery (Exa) ───────────────────────────────
  //
  // Fixture has 3 URLs; one (formstack.example) overlaps with the
  // TheirStack set seeded earlier in this GTM user's opportunities, so
  // runDiscoverDormant must skip it. Exa + Anthropic scoring stays 503
  // so downstream assertions on score.errors don't move.
  console.log("\n--- GTM discover-dormant (exa) ---");
  exaReturnsDormantFixture = true;
  const { runDiscoverDormant } =
    await import("../src/lib/pipeline/steps/discover-dormant");
  const icpRubricForDormant = (tables.user_scoring_profiles.find(
    (r) => r.user_id === gtmUserId,
  )?.icp_rubric ?? {}) as any;
  const dormant = await runDiscoverDormant(svc, gtmUserId, icpRubricForDormant);

  const dormantOpps = tables.opportunities.filter(
    (o) => o.user_id === gtmUserId && o.source === "exa-dormant",
  );

  assert(
    dormant.found === 3,
    `dormant.found === 3 from exa fixture (got ${dormant.found})`,
  );
  assert(
    dormant.inserted === 2,
    `dormant.inserted === 2 after dedup vs theirstack (got ${dormant.inserted})`,
  );
  assert(
    dormantOpps.length === 2,
    `exa-dormant opportunities count === 2 (got ${dormantOpps.length})`,
  );
  assert(
    dormantOpps.every((o) => o.role_title === null),
    "every exa-dormant opportunity has role_title=null",
  );
  assert(
    dormantOpps.every(
      (o) =>
        typeof o.company_domain === "string" && o.company_domain.length > 0,
    ),
    "every exa-dormant opportunity has company_domain",
  );
  assert(
    dormantOpps.every(
      (o) =>
        Array.isArray(o.trigger_signals) &&
        (o.trigger_signals as Record<string, unknown>[])[0]?.source ===
          "exa-dormant",
    ),
    "every exa-dormant opportunity carries matched_on_query trigger",
  );
  assert(
    dormantOpps.some((o) => o.company_domain === "newdormant.io"),
    "newdormant.io inserted as exa-dormant",
  );
  assert(
    dormantOpps.some((o) => o.company_domain === "anotherdormant.io"),
    "anotherdormant.io inserted as exa-dormant",
  );
  assert(
    !dormantOpps.some((o) => o.company_domain === "formstack.example"),
    "formstack.example NOT re-inserted (dedup against theirstack set)",
  );

  // ── Phase 5a: /activate fast preview ──────────────────────────────────
  //
  // runAccountActivationSearch runs TheirStack → inline score synchronously.
  // Exa/Anthropic are still 503 so scoring fails per-row. The contract:
  // scoreAccountAgainstIcp throws after its local retry, activation
  // isolates the row errors, and the UI can render scoring-failed
  // instead of pretending there are no accounts.
  console.log("\n--- GTM activation fast preview ---");
  const { runAccountActivationSearch } = await import("../src/lib/pipeline/activation-accounts");
  const { runExistingAccountActivationSearch } = await import("../src/lib/pipeline/activation-existing-accounts");
  const { __setRunGenerateObjectForTests } = await import("../src/lib/ai/calls");
  __setRunGenerateObjectForTests(() => {
    throw new Error("No object generated: fixture failure");
  });
  const activationResult = await runAccountActivationSearch(
    svc,
    gtmUserId,
    icpRubricForDormant,
  );

  assert(
    activationResult.stats.discovered === 3,
    `activation discovered === 3 from theirstack fixture — raw count pre-filter (got ${activationResult.stats.discovered})`,
  );
  assert(
    activationResult.stats.errors === 2,
    `activation errors === 2 under stubbed exa/anthropic (got ${activationResult.stats.errors})`,
  );
  assert(
    activationResult.stats.scored === 0,
    `activation scored === 0 when every row fails scoring (got ${activationResult.stats.scored})`,
  );
  assert(
    Array.isArray(activationResult.results) &&
      activationResult.results.length === 0,
    `activation results length === 0 when scoring fails loudly (got ${activationResult.results.length})`,
  );
  assert(
    activationResult.stats.firstError !== null &&
      activationResult.stats.firstError.includes("Scoring response"),
    `activation firstError carries a friendly mapAiError message (got ${JSON.stringify(activationResult.stats.firstError)})`,
  );
  assert(
    activationResult.stats.rubricIncomplete === false,
    "activation rubricIncomplete=false when hiring_roles present",
  );

  const callsBeforeExistingActivation = theirStackCallCount;
  const existingActivationResult = await runExistingAccountActivationSearch(
    svc,
    gtmUserId,
    icpRubricForDormant,
  );
  assert(
    theirStackCallCount === callsBeforeExistingActivation,
    "existing activation path does not call TheirStack",
  );
  assert(
    existingActivationResult.stats.discovered === 4,
    `existing activation discovered === 4 from saved GTM opportunities (got ${existingActivationResult.stats.discovered})`,
  );
  assert(
    existingActivationResult.stats.errors === 4,
    `existing activation errors === 4 under stubbed Anthropic (got ${existingActivationResult.stats.errors})`,
  );

  // Empty-rubric guard: a rubric without signals.hiring_roles must
  // short-circuit before TheirStack is called.
  const emptyRubric = {
    firmographics: {
      industries: [],
      employee_range: { min: 0, max: 10000 },
      stages: [],
      geographies: [],
    },
    signals: { hiring_roles: [], jtbd_evidence: [], trigger_events: [] },
    technographics: { required_tools: [], excluded_tools: [] },
    disqualifiers: {
      tech_disqualifiers: [],
      size_disqualifiers: "",
      stage_disqualifiers: [],
      behavioral_disqualifiers: [],
    },
  } as any;
  const emptyActivation = await runAccountActivationSearch(
    svc,
    gtmUserId,
    emptyRubric,
  );
  assert(
    emptyActivation.stats.rubricIncomplete === true,
    "empty-hiring_roles rubric sets rubricIncomplete=true",
  );
  assert(
    emptyActivation.stats.discovered === 0,
    "empty-hiring_roles rubric short-circuits before TheirStack",
  );

  // ── Phase 5b: clamp + round normalisation ────────────────────────────
  //
  // Loosened scoring schema (z.number() vs the prior int().min(1).max(5))
  // means downstream consumers must round + clamp at read time.
  // Inject a canned analysis with score=6 across the breakdown
  // (out-of-range) and 3.7 across the broad rollups (decimal) and
  // verify computeAccountScoreFromBreakdown clamps 6→5 → uniform 100.
  console.log("\n--- GTM activation clamp normalisation ---");
  const { ICP_DIMENSIONS } = await import("../src/lib/onboarding/icp-dimensions");
  exaReturnsEmpty = true;

  const broad = {
    score: 3.7,
    reasoning: "decimal — exercises loosened broad-component schema",
  };
  const breakdownAt6: Record<
    string,
    Record<string, { score: number; reasoning: string }>
  > = {};
  for (const dim of ICP_DIMENSIONS) {
    const sub: Record<string, { score: number; reasoning: string }> = {};
    for (const subDim of dim.subDimensions) {
      sub[subDim] = { score: 6, reasoning: "out of range — exercises clamp" };
    }
    breakdownAt6[dim.key] = sub;
  }
  const cannedAnalysis = {
    company_name: "TestCo",
    firmo_fit: broad,
    techno_fit: broad,
    hiring_signal_fit: broad,
    buyer_fit: broad,
    proof_point_relevance: broad,
    disqualifier_risk: broad,
    breakdown: breakdownAt6,
    verdict: "Pursue" as const,
    tier: "A" as const,
    reason_to_believe: "Clamp regression smoke test.",
  };
  __setRunGenerateObjectForTests((args) => args.schema.parse(cannedAnalysis));

  const clampActivation = await runAccountActivationSearch(
    svc,
    gtmUserId,
    icpRubricForDormant,
  );

  assert(
    clampActivation.stats.errors === 0,
    `clamp test: stats.errors === 0 (got ${clampActivation.stats.errors})`,
  );
  assert(
    clampActivation.stats.scored > 0,
    `clamp test: stats.scored > 0 — canned analysis must validate against loosened schema (got ${clampActivation.stats.scored})`,
  );
  assert(
    clampActivation.results.every((r) => r.score === 100),
    `clamp test: every result.score === 100 (out-of-range 6 clamped to 5 → uniform 100; got ${clampActivation.results
      .map((r) => r.score)
      .join(", ")})`,
  );

  __setRunGenerateObjectForTests(null);
  __setSupabaseServiceClientForTests(null);
  exaReturnsEmpty = false;

  console.log("\n===================================================");
  if (failures > 0) {
    console.error(`FAILED: ${failures} assertion(s) did not pass`);
    process.exitCode = 1;
  } else {
    console.log("PASSED: regression gate green on current pipeline behavior");
  }

  globalThis.fetch = originalFetch;
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exitCode = 1;
});
