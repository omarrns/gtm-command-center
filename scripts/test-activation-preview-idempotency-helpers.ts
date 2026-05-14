import type { SupabaseClient } from "@supabase/supabase-js";

export interface MockRow {
  [key: string]: unknown;
}

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface QueryChain extends PromiseLike<QueryResult> {
  select: (fields?: string) => QueryChain;
  eq: (field: string, value: unknown) => QueryChain;
  gte: (field: string, value: unknown) => QueryChain;
  in: (field: string, values: unknown[]) => QueryChain;
  not: (field: string, op: string, value: unknown) => QueryChain;
  order: (field: string, opts?: { ascending?: boolean }) => QueryChain;
  limit: (count: number) => QueryChain;
  single: () => QueryResult;
  maybeSingle: () => QueryResult;
}

export const tables: Record<string, MockRow[]> = {
  pipeline_config: [],
  profiles: [],
  opportunities: [],
  analyses: [],
  memory_documents: [],
  user_scoring_profiles: [],
  watchlist: [],
};

const originalFetch = globalThis.fetch;
let idCounter = 0;
let jsearchCallCount = 0;
let blockOpportunityClaims = false;
let jsearchResponses: MockRow[][] = [];

globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.includes("jsearch.p.rapidapi.com")) {
    jsearchCallCount++;
    return jsonResponse({ data: jsearchResponses.shift() ?? [] });
  }
  if (url.includes("api.exa.ai/search")) return jsonResponse({ results: [] });
  return jsonResponse({ error: "stubbed" }, 503);
}) as typeof fetch;

export function restoreFetch() {
  globalThis.fetch = originalFetch;
}

export function getJSearchCallCount() {
  return jsearchCallCount;
}

export function setJSearchResponses(responses: MockRow[][]) {
  jsearchResponses = responses;
}

export function setBlockOpportunityClaims(blocked: boolean) {
  blockOpportunityClaims = blocked;
}

export function resetState() {
  for (const rows of Object.values(tables)) rows.length = 0;
  idCounter = 0;
  jsearchCallCount = 0;
  blockOpportunityClaims = false;
  jsearchResponses = [];
}

export function createMockSupabase(): SupabaseClient {
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

    const chain: Partial<QueryChain> = {
      select(fields?: string) {
        selectFields = fields ?? "*";
        return chain as QueryChain;
      },
      eq(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
        return chain as QueryChain;
      },
      gte(field: string, value: unknown) {
        filters.push((row) => String(row[field] ?? "") >= String(value ?? ""));
        return chain as QueryChain;
      },
      in(field: string, values: unknown[]) {
        filters.push((row) => values.includes(row[field]));
        return chain as QueryChain;
      },
      not(field: string, op: string, value: unknown) {
        if (op === "is" && value === null) {
          filters.push((row) => row[field] != null);
        }
        return chain as QueryChain;
      },
      order(field: string, opts?: { ascending?: boolean }) {
        orderField = field;
        orderAsc = opts?.ascending ?? true;
        return chain as QueryChain;
      },
      limit(count: number) {
        limitCount = count;
        return chain as QueryChain;
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

    function resolve(): QueryResult {
      if (pendingInsert) return resolveInsert(pendingInsert);
      if (pendingUpsert) return resolveUpsert(pendingUpsert);
      if (pendingUpdate) return resolveUpdate(pendingUpdate);

      let rows = tables[table].filter((row) => filters.every((fn) => fn(row)));
      if (orderField) {
        rows = [...rows].sort((a, b) => {
          const left = String(a[orderField!] ?? "");
          const right = String(b[orderField!] ?? "");
          const cmp = left < right ? -1 : left > right ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitCount != null) rows = rows.slice(0, limitCount);
      return shapeResult(rows);
    }

    function resolveInsert(rowInput: MockRow) {
      const row = withDefaults({ ...rowInput, id: rowInput.id ?? nextId() });
      tables[table].push(row);
      return shapeResult([row]);
    }

    function resolveUpsert(upsert: NonNullable<typeof pendingUpsert>) {
      const conflictFields = upsert.onConflict.split(",");
      const existing = tables[table].find((row) =>
        conflictFields.every((field) => row[field] === upsert.row[field]),
      );
      if (existing && upsert.ignoreDuplicates) return shapeResult([]);
      if (existing) {
        Object.assign(existing, upsert.row);
        return shapeResult([existing]);
      }
      const row = withDefaults({ ...upsert.row, id: upsert.row.id ?? nextId() });
      tables[table].push(row);
      return shapeResult([row]);
    }

    function resolveUpdate(update: Partial<MockRow>) {
      const rows = tables[table].filter((row) => filters.every((fn) => fn(row)));
      for (const row of rows) Object.assign(row, update);
      return shapeResult(rows);
    }

    function shapeResult(rows: MockRow[]) {
      const data = rows.map((row) => (selectFields ? pick(row, selectFields) : row));
      return {
        data: isSingle || isMaybeSingle ? (data[0] ?? null) : data,
        error: null,
      };
    }

    function withDefaults(row: MockRow) {
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
        score_components: null,
        analysis_id: null,
        last_error: null,
        ...row,
      };
    }

    chain.then = (onFulfill, onReject) =>
      Promise.resolve(resolve()).then(onFulfill, onReject);

    return {
      chain: chain as QueryChain,
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
      const query = buildQuery(table);
      return {
        select: query.chain.select,
        insert(row: MockRow) {
          query.setInsert(row);
          return query.chain;
        },
        update(row: Partial<MockRow>) {
          query.setUpdate(row);
          return query.chain;
        },
        upsert(row: MockRow, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
          query.setUpsert(row, opts.onConflict, opts.ignoreDuplicates ?? false);
          return query.chain;
        },
      };
    },
    rpc(name: string, params: Record<string, unknown>) {
      if (name === "claim_activation_run") {
        return Promise.resolve({
          data: claimActivation(requireString(params.p_user_id)),
          error: null,
        });
      }
      if (name === "claim_opportunity") {
        return Promise.resolve({
          data: claimOpportunity(
            requireString(params.p_id),
            requireString(params.p_user_id),
          ),
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { message: `Unknown RPC: ${name}` },
      });
    },
  } as unknown as SupabaseClient;
}

export function seedUser(userId: string, config: Partial<MockRow> = {}) {
  tables.profiles.push({ user_id: userId, display_name: "Avery" });
  tables.memory_documents.push({
    user_id: userId,
    document_key: "user_profile",
    title: "Profile",
    content: "GTM engineering profile.",
  });
  tables.pipeline_config.push({
    id: nextId(),
    user_id: userId,
    search_queries: ["GTM Engineer", "Growth Engineer"],
    search_locations: ["Remote"],
    score_threshold: 70,
    daily_send_cap: 10,
    gmail_send_address: null,
    activation_completed_at: null,
    activation_started_at: null,
    ...config,
  });
}

export function freshJobs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    job_id: `job-${index + 1}`,
    job_title: `GTM Engineer ${index + 1}`,
    employer_name: `Company ${index + 1}`,
    job_city: "Remote",
    job_state: null,
    job_country: "us",
    job_is_remote: true,
    job_apply_link: `https://example.com/jobs/${index + 1}`,
    job_description: "Build GTM systems.",
    job_employment_type: "FULLTIME",
    job_min_salary: null,
    job_max_salary: null,
    job_salary_currency: null,
    job_salary_period: null,
    job_posted_at_datetime_utc: new Date().toISOString(),
    job_required_skills: ["TypeScript"],
    job_highlights: null,
  }));
}

function claimActivation(userId: string): boolean {
  const row = tables.pipeline_config.find((config) => config.user_id === userId);
  if (!row || row.activation_completed_at) return false;
  const startedAt = row.activation_started_at;
  if (typeof startedAt === "string") {
    const stale =
      new Date(startedAt).getTime() < Date.now() - 10 * 60 * 1000;
    if (!stale) return false;
  }
  row.activation_started_at = new Date().toISOString();
  row.updated_at = new Date().toISOString();
  return true;
}

function claimOpportunity(id: string, userId: string): boolean {
  if (blockOpportunityClaims) return false;
  const row = tables.opportunities.find((opp) => opp.id === id && opp.user_id === userId);
  if (!row || row.processing_started_at) return false;
  row.processing_started_at = new Date().toISOString();
  row.attempt_count =
    (typeof row.attempt_count === "number" ? row.attempt_count : 0) + 1;
  return true;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected string RPC parameter");
  }
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}

function nextId(): string {
  return `mock-${++idCounter}`;
}

function pick(row: MockRow, fields: string): MockRow {
  if (fields === "*") return { ...row };
  const out: MockRow = {};
  for (const field of fields.split(",").map((value) => value.trim())) {
    out[field] = row[field];
  }
  return out;
}
