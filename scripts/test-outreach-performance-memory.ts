import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOutreachPerformanceMarkdown,
  writeOutreachPerformanceMemory,
} from "../src/lib/outreach/performance-memory";
import { formatMemoryForPrompt, loadMemoryContext } from "../src/lib/skills/context";

type Row = Record<string, unknown>;

const userId = "user-outreach-memory";
const tables: Record<string, Row[]> = {
  outreach_events: [],
  opportunities: [],
  email_drafts: [],
  memory_documents: [],
  profiles: [{ user_id: userId, display_name: "Avery Chen" }],
};

function resetTables(): void {
  tables.outreach_events = [
    {
      id: "event-1",
      user_id: userId,
      opportunity_id: "opp-1",
      email_draft_id: "draft-1",
      event_type: "manual_outcome",
      source: "accounts",
      metadata: {
        outcome: "positive_reply",
        note: "Buyer said the pipeline coverage angle was timely.",
      },
      occurred_at: "2026-04-30T18:00:00.000Z",
      created_at: "2026-04-30T18:00:00.000Z",
    },
    {
      id: "event-2",
      user_id: userId,
      opportunity_id: "opp-2",
      email_draft_id: "draft-2",
      event_type: "manual_outcome",
      source: "accounts",
      metadata: { outcome: "not_icp", note: "Too small and founder-led." },
      occurred_at: "2026-04-29T18:00:00.000Z",
      created_at: "2026-04-29T18:00:00.000Z",
    },
    {
      id: "event-3",
      user_id: userId,
      opportunity_id: "opp-1",
      email_draft_id: "draft-1",
      event_type: "reply_detected",
      source: "reply_cron",
      metadata: { gmailThreadId: "thread-1" },
      occurred_at: "2026-05-01T18:00:00.000Z",
      created_at: "2026-05-01T18:00:00.000Z",
    },
  ];
  tables.opportunities = [
    {
      id: "opp-1",
      user_id: userId,
      source: "theirstack",
      company_name: "Northstar Revenue",
      role_title: "VP Sales",
      recipient_title: "VP Revenue Operations",
      score: 91,
      trigger_signals: [{ type: "hiring", role: "SDR Manager" }],
    },
    {
      id: "opp-2",
      user_id: userId,
      source: "exa-dormant",
      company_name: "TinyCo",
      role_title: "Founder",
      recipient_title: "Founder",
      score: 42,
      trigger_signals: [{ type: "firmographic", signal: "Sub-10 employees" }],
    },
  ];
  tables.email_drafts = [
    {
      id: "draft-1",
      user_id: userId,
      opportunity_id: "opp-1",
      subject: "Pipeline coverage",
      body: "Saw the SDR hiring push.",
    },
    {
      id: "draft-2",
      user_id: userId,
      opportunity_id: "opp-2",
      subject: "Revenue workflow",
      body: "Worth comparing notes?",
    },
  ];
  tables.memory_documents = [];
}

function createMockSupabase(): SupabaseClient {
  return {
    from(table: string) {
      return {
        select(fields?: string) {
          return buildQuery(table, fields ?? "*");
        },
        upsert(payload: Row) {
          upsertRow(table, payload);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

function buildQuery(table: string, fields: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let orderField: string | null = null;
  let orderAscending = true;
  let limitCount: number | null = null;

  function resolve(): { data: Row[]; error: null } {
    let rows = [...(tables[table] ?? [])].filter((row) =>
      filters.every((filter) => filter(row)),
    );
    if (orderField) {
      rows.sort((left, right) => {
        const leftValue = String(left[orderField!] ?? "");
        const rightValue = String(right[orderField!] ?? "");
        const comparison = leftValue.localeCompare(rightValue);
        return orderAscending ? comparison : -comparison;
      });
    }
    if (limitCount != null) rows = rows.slice(0, limitCount);
    return { data: rows.map((row) => pick(row, fields)), error: null };
  }

  const chain = {
    eq(field: string, value: unknown) {
      filters.push((row) => row[field] === value);
      return chain;
    },
    gte(field: string, value: unknown) {
      filters.push((row) => String(row[field] ?? "") >= String(value));
      return chain;
    },
    in(field: string, values: unknown[]) {
      filters.push((row) => values.includes(row[field]));
      return chain;
    },
    order(field: string, options?: { ascending?: boolean }) {
      orderField = field;
      orderAscending = options?.ascending ?? true;
      return chain;
    },
    limit(count: number) {
      limitCount = count;
      return chain;
    },
    maybeSingle() {
      const result = resolve();
      return Promise.resolve({ data: result.data[0] ?? null, error: null });
    },
    then(onFulfilled: (value: { data: Row[]; error: null }) => unknown) {
      return Promise.resolve(resolve()).then(onFulfilled);
    },
  };

  return chain;
}

function upsertRow(table: string, payload: Row): void {
  if (table !== "memory_documents") throw new Error(`unexpected upsert: ${table}`);
  const existing = tables.memory_documents.find(
    (row) =>
      row.user_id === payload.user_id &&
      row.document_key === payload.document_key,
  );
  if (existing) {
    Object.assign(existing, payload);
    return;
  }
  tables.memory_documents.push({ id: `memory-${tables.memory_documents.length + 1}`, ...payload });
}

function pick(row: Row, fields: string): Row {
  if (fields === "*") return { ...row };
  const picked: Row = {};
  for (const field of fields.split(",").map((part) => part.trim())) {
    picked[field] = row[field];
  }
  return picked;
}

async function testWriterProducesStableMemory(): Promise<void> {
  resetTables();
  const svc = createMockSupabase();
  const result = await writeOutreachPerformanceMemory({
    svc,
    userId,
    sinceDays: 30,
    limit: 10,
    runId: "run-test",
  });

  assert.equal(result.eventCount, 3);
  assert.equal(result.oldestEventAt, "2026-04-29T18:00:00.000Z");
  assert.equal(result.newestEventAt, "2026-05-01T18:00:00.000Z");
  assert.match(result.content, /## Positive Patterns/);
  assert.match(result.content, /Positive outcomes with subject: "Pipeline coverage"/);
  assert.match(result.content, /Positive outcomes with trigger: Type: hiring/);
  assert.match(result.content, /## Negative Patterns/);
  assert.match(result.content, /Negative outcomes with buyer title: Founder/);
  assert.match(result.content, /Type: hiring/);
  assert.match(result.content, /Buyer title: VP Revenue Operations/);
  assert.match(result.content, /Buyer said the pipeline coverage angle was timely/);
  assert.equal(tables.memory_documents.length, 1);
  assert.equal(tables.memory_documents[0].document_key, "feedback_outreach_performance");
  assert.equal(tables.memory_documents[0].origin, "system");
}

async function testWriterIsIdempotentAndPromptReadable(): Promise<void> {
  const svc = createMockSupabase();
  await writeOutreachPerformanceMemory({ svc, userId, sinceDays: 30, limit: 10 });
  await writeOutreachPerformanceMemory({ svc, userId, sinceDays: 30, limit: 10 });
  assert.equal(tables.memory_documents.length, 1);

  const ctx = await loadMemoryContext(userId, svc);
  const promptMemory = formatMemoryForPrompt(ctx, ["feedback_outreach_performance"]);
  assert.match(promptMemory, /## Outreach Performance Feedback \(feedback_outreach_performance\)/);
  assert.match(promptMemory, /## Positive Patterns/);
}

function testEmptyMarkdownIsStable(): void {
  const markdown = buildOutreachPerformanceMarkdown([]);
  assert.match(markdown, /## Positive Patterns\n- Not enough signal yet./);
  assert.match(markdown, /- Events reviewed: 0/);
}

async function main(): Promise<void> {
  await testWriterProducesStableMemory();
  await testWriterIsIdempotentAndPromptReadable();
  testEmptyMarkdownIsStable();
  console.log("outreach performance memory tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
