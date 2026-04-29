#!/usr/bin/env tsx
/**
 * Regression coverage for job-seeker structured-output retry.
 *
 * Run: pnpm test:job-scoring-retry
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "dotenv";
import { NoObjectGeneratedError } from "ai";
import { MODELS } from "../src/lib/ai/anthropic";
import { __setRunGenerateObjectForTests } from "../src/lib/ai/calls";
import { runScore } from "../src/lib/pipeline/steps/score";

config({ path: ".env.local" });

process.env.EXA_API_KEY ||= "test-fixture-key";

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: any) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("api.exa.ai/search")) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  }
  return new Response(JSON.stringify({ error: "stubbed" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}) as typeof fetch;

interface MockRow {
  [key: string]: any;
}

const tables: Record<string, MockRow[]> = {
  profiles: [],
  pipeline_config: [],
  opportunities: [],
  analyses: [],
  memory_documents: [],
  user_scoring_profiles: [],
  watchlist: [],
};

let idCounter = 0;
let failures = 0;

function nextId(): string {
  return `mock-${++idCounter}`;
}

function resetTables() {
  for (const rows of Object.values(tables)) rows.length = 0;
  idCounter = 0;
}

function pick(row: MockRow, fields: string): MockRow {
  if (fields === "*") return { ...row };
  const out: MockRow = {};
  for (const field of fields.split(",").map((s) => s.trim())) {
    out[field] = row[field];
  }
  return out;
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
    let pendingInsert: MockRow | null = null;
    let pendingUpdate: Partial<MockRow> | null = null;
    let pendingUpsert: {
      row: MockRow;
      onConflict: string;
      ignoreDuplicates: boolean;
    } | null = null;

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
      or() {
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

    function resolve(): { data: any; error: any } {
      if (pendingInsert) {
        const row = { ...pendingInsert, id: pendingInsert.id ?? nextId() };
        tables[table].push(row);
        const data = selectFields ? pick(row, selectFields) : row;
        return { data: isSingle || isMaybeSingle ? data : [data], error: null };
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
          const data = selectFields ? pick(existing, selectFields) : existing;
          return { data: isSingle || isMaybeSingle ? data : [data], error: null };
        }
        const row = { ...pendingUpsert.row, id: pendingUpsert.row.id ?? nextId() };
        tables[table].push(row);
        const data = selectFields ? pick(row, selectFields) : row;
        return { data: isSingle || isMaybeSingle ? data : [data], error: null };
      }

      if (pendingUpdate) {
        const rows = tables[table].filter((row) => filters.every((f) => f(row)));
        for (const row of rows) Object.assign(row, pendingUpdate);
        const data = rows.map((row) => (selectFields ? pick(row, selectFields) : row));
        return {
          data: isSingle || isMaybeSingle ? (data[0] ?? null) : data,
          error: null,
        };
      }

      let rows = tables[table].filter((row) => filters.every((f) => f(row)));
      if (orderField) {
        rows = [...rows].sort((a, b) => {
          const cmp = a[orderField!] < b[orderField!] ? -1 : a[orderField!] > b[orderField!] ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitCount != null) rows = rows.slice(0, limitCount);
      const data = rows.map((row) => (selectFields ? pick(row, selectFields) : row));
      return {
        data: isSingle || isMaybeSingle ? (data[0] ?? null) : data,
        error: null,
      };
    }

    chain.then = (onFulfill: any, onReject?: any) =>
      Promise.resolve(resolve()).then(onFulfill, onReject);

    return {
      chain,
      setInsert(row: MockRow) {
        pendingInsert = row;
      },
      setUpdate(row: Partial<MockRow>) {
        pendingUpdate = row;
      },
      setUpsert(row: MockRow, onConflict: string, ignoreDuplicates: boolean) {
        pendingUpsert = { row, onConflict, ignoreDuplicates };
      },
    };
  }

  return {
    from(table: string) {
      const q = buildQuery(table);
      return {
        select: q.chain.select,
        insert(row: MockRow) {
          q.setInsert(row);
          return q.chain;
        },
        update(row: Partial<MockRow>) {
          q.setUpdate(row);
          return q.chain;
        },
        upsert(row: MockRow, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
          q.setUpsert(row, opts.onConflict, opts.ignoreDuplicates ?? false);
          return q.chain;
        },
      };
    },
    rpc(name: string, params: any) {
      if (name !== "claim_opportunity") {
        return Promise.resolve({
          data: null,
          error: { message: `Unknown RPC: ${name}` },
        });
      }
      const opp = tables.opportunities.find(
        (row) => row.id === params.p_id && row.user_id === params.p_user_id,
      );
      if (!opp || opp.processing_started_at) {
        return Promise.resolve({ data: false, error: null });
      }
      opp.processing_started_at = new Date().toISOString();
      opp.attempt_count = (opp.attempt_count ?? 0) + 1;
      return Promise.resolve({ data: true, error: null });
    },
  };
}

function objectFailure(message = "No object generated: response did not match schema") {
  return new NoObjectGeneratedError({
    message,
    text: '{"jd_fit":"{\\"scorecard\\":{}}"}',
    response: {} as any,
    usage: {} as any,
    finishReason: "stop",
  });
}

function analysis(score = 3.5) {
  const dim = { score, justification: "Fixture evidence." };
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
      total_score: score,
      verdict: "Solid match",
      requirement_matches: [
        {
          requirement: "Build pipeline",
          status: "STRONG MATCH",
          evidence: "Fixture evidence.",
          notes: "Fixture notes.",
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
      total_score: score,
      verdict: "Worth exploring",
    },
    company_overview: {
      what_they_do: "Fixture product.",
      stage_and_funding: "Series B.",
      gtm_motion: "Sales-led.",
      founder_profile: { name: "Founder", background: "Operator." },
    },
    flags: { green: ["Relevant"], red: [], orange: [] },
    interview_angle: "Talk pipeline.",
    outreach_angle: {
      hook: "Relevant role.",
      bullets: ["Pipeline work"],
      bridge: "I can help.",
      ask: "Open to chat?",
    },
    positioning_recommendations: ["Lead with GTM systems."],
    bottom_line: "Fixture result.",
  };
}

function seedOpportunity(userId: string, id: string, companyName: string, lastError: string | null = null) {
  tables.opportunities.push({
    id,
    user_id: userId,
    source: "jsearch",
    external_id: id,
    company_name: companyName,
    role_title: "GTM Engineer",
    job_description: "Build pipeline.",
    stage: "discovered",
    score: null,
    score_components: null,
    analysis_id: null,
    last_error: lastError,
    processing_started_at: null,
    attempt_count: 0,
    enrichment_attempts: 0,
    max_enrichment_attempts: 3,
    discovered_at: new Date().toISOString(),
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`  FAIL: ${message}`);
  } else {
    console.log(`  PASS: ${message}`);
  }
}

async function main() {
  console.log("Job-seeker scoring retry regression");
  console.log("===================================");

  resetTables();
  const svc = createMockSupabase();
  const userId = "retry-user";
  tables.profiles.push({ user_id: userId, display_name: "Omar" });
  tables.memory_documents.push({
    user_id: userId,
    document_key: "user_profile",
    title: "Profile",
    content: "GTM engineering profile.",
  });
  const config = {
    user_id: userId,
    score_threshold: 70,
  } as any;
  seedOpportunity(userId, "opp-1", "RetryCo", "old error");
  seedOpportunity(userId, "opp-2", "FailCo");
  seedOpportunity(userId, "opp-3", "LaterCo");

  const calls: Array<{ model: string; oppId: string | undefined }> = [];
  __setRunGenerateObjectForTests((args) => {
    calls.push({ model: args.model, oppId: args.scope?.scopeId });
    if (args.scope?.scopeId === "opp-1" && args.model === MODELS.sonnet) {
      throw objectFailure();
    }
    if (args.scope?.scopeId === "opp-2") {
      throw objectFailure("No object generated: no low surrogate in string");
    }
    return args.schema.parse(analysis());
  });

  const result = await runScore(svc, userId, config, "retry-run");
  const opp1 = tables.opportunities.find((row) => row.id === "opp-1")!;
  const opp2 = tables.opportunities.find((row) => row.id === "opp-2")!;
  const opp3 = tables.opportunities.find((row) => row.id === "opp-3")!;

  assert(result.processed === 3, `processed all 3 rows (got ${result.processed})`);
  assert(result.scored === 2, `scored 2 rows (got ${result.scored})`);
  assert(result.errors === 1, `recorded 1 final error (got ${result.errors})`);
  assert(
    calls.filter((call) => call.oppId === "opp-1").map((call) => call.model).join(",") ===
      `${MODELS.sonnet},${MODELS.opus}`,
    "opp-1 retried Sonnet failure with Opus",
  );
  assert(
    calls.filter((call) => call.oppId === "opp-2").map((call) => call.model).join(",") ===
      `${MODELS.sonnet},${MODELS.opus}`,
    "opp-2 failed after one Opus retry",
  );
  assert(
    calls.filter((call) => call.oppId === "opp-3").map((call) => call.model).join(",") ===
      MODELS.sonnet,
    "opp-3 did not call Opus after Sonnet success",
  );
  assert(opp1.stage === "scored", "retried row advanced to scored");
  assert(opp1.last_error === null, "successful retry cleared stale last_error");
  assert(opp2.stage === "discovered", "final failure stayed discovered");
  assert(typeof opp2.last_error === "string", "final failure persisted last_error");
  assert(opp3.stage === "scored", "batch continued after final failure");

  __setRunGenerateObjectForTests(null);
  globalThis.fetch = originalFetch;

  if (failures > 0) {
    console.error(`FAILED: ${failures} assertion(s) did not pass`);
    process.exitCode = 1;
  } else {
    console.log("PASSED: job-seeker scoring retry behavior is locked");
  }
}

main().catch((err) => {
  __setRunGenerateObjectForTests(null);
  globalThis.fetch = originalFetch;
  console.error("Test runner crashed:", err);
  process.exitCode = 1;
});
