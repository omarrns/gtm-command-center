#!/usr/bin/env tsx
/**
 * Regression gate for the durable workflow persona boundary.
 *
 * The live cron path dispatches pipelineWorkflow(userId, runId) for each
 * pipeline_config row. job_seeker users should run the job-seeker pipeline;
 * gtm users must be a no-op here because GTM account discovery/scoring lives
 * on the separate GTM runner/webhook paths.
 *
 * Run: npm run test:pipeline-workflow-persona
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __setRunGenerateObjectForTests } from "../src/lib/ai/calls";
import { __setSupabaseServiceClientForTests } from "../src/lib/supabase/service";

config({ path: ".env.local" });

process.env.RAPIDAPI_KEY ||= "test-fixture-key";
process.env.ANTHROPIC_API_KEY ||= "test-fixture-key";
process.env.EXA_API_KEY ||= "test-fixture-key";

const JSEARCH_FIXTURE = [
  {
    job_id: "workflow-job-1",
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
    job_id: "workflow-job-2",
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
];

let jsearchCallCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: any) => {
  const url = typeof input === "string" ? input : input.toString();

  if (url.includes("jsearch.p.rapidapi.com")) {
    jsearchCallCount++;
    const data = jsearchCallCount === 1 ? JSEARCH_FIXTURE : [];
    return jsonResponse({ data });
  }

  if (url.includes("api.exa.ai/search")) {
    return jsonResponse({
      results: [
        {
          title: "Fixture company overview",
          url: "https://example.com/company",
          text: "Fixture company context for scoring.",
        },
      ],
    });
  }

  return jsonResponse({ error: "stubbed-in-test" }, 503);
}) as typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}

// Stub the wrapped AI object call used by scoreOpportunity. The fixture is
// deliberately high-scoring so rows advance discovered -> scored.
__setRunGenerateObjectForTests((args) => args.schema.parse(highScoreAnalysis()));

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
  ai_calls: [],
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
    let selectFields: string | null = null;
    let limitCount: number | null = null;
    let orderField: string | null = null;
    let orderAsc = true;
    let isSingle = false;
    let isMaybeSingle = false;
    let pendingInsert: MockRow | MockRow[] | null = null;
    let pendingUpsert: {
      row: MockRow;
      onConflict: string;
      ignoreDuplicates: boolean;
    } | null = null;
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
        return chain;
      },
      gte(field: string, value: any) {
        filters.push((row) => row[field] >= value);
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

    function shapeRows(rows: MockRow[]) {
      return rows.map((row) => (selectFields ? pick(row, selectFields) : row));
    }

    function resolve(): { data: any; error: any } {
      if (pendingInsert) {
        const inserted = (Array.isArray(pendingInsert)
          ? pendingInsert
          : [pendingInsert]
        ).map((input) => {
          const row = withInsertDefaults({ ...input, id: input.id ?? nextId() });
          tables[table].push(row);
          return row;
        });
        if (isSingle || isMaybeSingle) {
          return {
            data: inserted[0]
              ? selectFields
                ? pick(inserted[0], selectFields)
                : inserted[0]
              : null,
            error: null,
          };
        }
        return { data: shapeRows(inserted), error: null };
      }

      if (pendingUpsert) {
        const conflictFields = pendingUpsert.onConflict.split(",");
        const existing = tables[table].find((row) =>
          conflictFields.every((field) => row[field] === pendingUpsert!.row[field]),
        );
        if (existing && pendingUpsert.ignoreDuplicates) {
          return { data: isSingle || isMaybeSingle ? null : [], error: null };
        }
        if (existing) {
          Object.assign(existing, pendingUpsert.row);
          return {
            data:
              isSingle || isMaybeSingle
                ? selectFields
                  ? pick(existing, selectFields)
                  : existing
                : shapeRows([existing]),
            error: null,
          };
        }
        const row = withInsertDefaults({
          ...pendingUpsert.row,
          id: pendingUpsert.row.id ?? nextId(),
        });
        tables[table].push(row);
        return {
          data:
            isSingle || isMaybeSingle
              ? selectFields
                ? pick(row, selectFields)
                : row
              : shapeRows([row]),
          error: null,
        };
      }

      if (pendingUpdate) {
        const rows = tables[table].filter((row) => filters.every((f) => f(row)));
        for (const row of rows) Object.assign(row, pendingUpdate);
        if (isSingle || isMaybeSingle) {
          return {
            data: rows[0] ? (selectFields ? pick(rows[0], selectFields) : rows[0]) : null,
            error: null,
          };
        }
        return { data: shapeRows(rows), error: null };
      }

      let rows = tables[table].filter((row) => filters.every((f) => f(row)));
      if (orderField) {
        const field = orderField;
        rows = [...rows].sort((a, b) => {
          const cmp = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitCount != null) rows = rows.slice(0, limitCount);

      if (isSingle || isMaybeSingle) {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: shapeRows(rows), error: null };
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
      setInsert: (row: MockRow | MockRow[]) => {
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
        insert(row: MockRow | MockRow[]) {
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
          (row) => row.id === params.p_id && row.user_id === params.p_user_id,
        );
        if (!opp || opp.processing_started_at) {
          return Promise.resolve({ data: false, error: null });
        }
        opp.processing_started_at = new Date().toISOString();
        opp.attempt_count = (opp.attempt_count ?? 0) + 1;
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: `Unknown RPC: ${name}` },
      });
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
  console.log("Pipeline workflow persona regression");
  console.log("====================================");

  const svc = createMockSupabase();
  __setSupabaseServiceClientForTests(() => svc);

  seedUser("test-user-job-seeker", "job_seeker");
  seedUser("test-user-gtm", "gtm");

  const { pipelineWorkflow } = await import("../src/lib/pipeline/workflow");

  const jobSeeker = await pipelineWorkflow(
    "test-user-job-seeker",
    "workflow-persona-job-seeker",
  );
  const jobSeekerOpps = tables.opportunities.filter(
    (row) => row.user_id === "test-user-job-seeker",
  );

  console.log("\n--- job_seeker workflow ---");
  assert(
    jobSeeker.discover.found > 0,
    `discover.found > 0 (got ${jobSeeker.discover.found})`,
  );
  assert(
    jobSeeker.score.scored > 0,
    `score.scored > 0 (got ${jobSeeker.score.scored})`,
  );
  assert(
    jobSeekerOpps.length > 0,
    `opportunities inserted for job_seeker (got ${jobSeekerOpps.length})`,
  );
  assert(
    jobSeekerOpps.every((row) => row.source === "jsearch"),
    "job_seeker opportunities are jsearch-sourced",
  );

  jsearchCallCount = 0;
  const gtm = await pipelineWorkflow("test-user-gtm", "workflow-persona-gtm");
  const gtmJsearchOpps = tables.opportunities.filter(
    (row) => row.user_id === "test-user-gtm" && row.source === "jsearch",
  );

  console.log("\n--- gtm workflow ---");
  assert(gtm.error === null, `gtm result.error === null (got ${gtm.error})`);
  assert(
    gtm.discover.found === 0,
    `gtm discover.found === 0 (got ${gtm.discover.found})`,
  );
  assert(
    gtm.score.scored === 0,
    `gtm score.scored === 0 (got ${gtm.score.scored})`,
  );
  assert(
    gtmJsearchOpps.length === 0,
    `no jsearch rows inserted for gtm user (got ${gtmJsearchOpps.length})`,
  );
  assert(
    jsearchCallCount === 0,
    `gtm workflow made zero JSearch calls (got ${jsearchCallCount})`,
  );

  globalThis.fetch = originalFetch;
  __setRunGenerateObjectForTests(null);
  __setSupabaseServiceClientForTests(null);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

function seedUser(userId: string, userType: "job_seeker" | "gtm") {
  tables.pipeline_config.push({
    id: nextId(),
    user_id: userId,
    search_queries: ["GTM Engineer", "Growth Engineer"],
    search_locations: ["San Francisco"],
    score_threshold: 70,
    daily_send_cap: 10,
    activation_completed_at: new Date().toISOString(),
  });
  tables.profiles.push({
    id: nextId(),
    user_id: userId,
    email: `${userId}@example.com`,
    display_name: "Test User",
    user_type: userType,
  });
}

function highScoreAnalysis() {
  const dim = { score: 3.75, justification: "fixture passing score" };
  return {
    company_name: "FixtureCo",
    role_title: "GTM Engineer",
    jd_fit: {
      scorecard: {
        years_seniority: dim,
        core_responsibilities: dim,
        technical_requirements: dim,
        industry_domain: dim,
        outcome_evidence: dim,
        soft_skills: dim,
        gap_risk: dim,
      },
      total_score: 26.25,
      verdict: "Solid match",
      requirement_matches: [
        {
          requirement: "Build pipeline",
          status: "STRONG MATCH",
          evidence: "Fixture evidence",
          notes: "Fixture notes",
        },
      ],
    },
    strategic_fit: {
      scorecard: {
        market_familiarity: dim,
        product_adjacency: dim,
        gtm_motion_match: dim,
        ai_technical_edge: dim,
        founder_alignment: dim,
        stage_match: dim,
      },
      total_score: 22.5,
      verdict: "Pursue",
    },
    company_overview: {
      what_they_do: "Fixture company.",
      stage_and_funding: "Fixture stage.",
      gtm_motion: "Fixture motion.",
      founder_profile: {
        name: "Fixture Founder",
        background: "Fixture background.",
      },
    },
    flags: {
      green: ["Strong role fit"],
      red: [],
      orange: [],
    },
    interview_angle: "Discuss pipeline systems.",
    outreach_angle: {
      hook: "Relevant GTM engineering work.",
      bullets: ["Pipeline", "Automation"],
      bridge: "Shared GTM systems focus.",
      ask: "Open to a quick chat?",
    },
    positioning_recommendations: ["Lead with automation outcomes."],
    bottom_line: "Pursue.",
  };
}

main().catch((err) => {
  globalThis.fetch = originalFetch;
  __setRunGenerateObjectForTests(null);
  __setSupabaseServiceClientForTests(null);
  console.error(err);
  process.exit(1);
});
