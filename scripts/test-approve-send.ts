#!/usr/bin/env tsx
import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  approveOpportunityForSend,
  type ApproveOpportunityForSendDeps,
} from "../src/lib/outreach/approve-send";
import type { Logger } from "../src/lib/logger";
import type { OpportunityStage } from "../src/lib/supabase/types";

interface MockRow {
  [key: string]: unknown;
}

type AdvanceStageFn = NonNullable<
  ApproveOpportunityForSendDeps["advanceStageImpl"]
>;
type SendEmailFn = NonNullable<ApproveOpportunityForSendDeps["sendEmailImpl"]>;
type RecordOutreachEventFn = NonNullable<
  ApproveOpportunityForSendDeps["recordOutreachEventImpl"]
>;
type OutreachEventInput = Parameters<RecordOutreachEventFn>[1];

const userId = "user-approve-send";
const opportunityId = "opp-approve-send";
const draftId = "draft-approve-send";
const sentAt = "2026-05-04T12:00:00.000Z";

const tables: Record<string, MockRow[]> = {
  gmail_credentials: [],
  opportunities: [],
  email_drafts: [],
  pipeline_config: [],
};

function resetTables(options: {
  hasDraft?: boolean;
  hasRecipient?: boolean;
} = {}): void {
  const hasDraft = options.hasDraft ?? true;
  const hasRecipient = options.hasRecipient ?? true;
  for (const rows of Object.values(tables)) rows.length = 0;

  tables.gmail_credentials.push({ id: "gmail-1", user_id: userId });
  tables.pipeline_config.push({
    user_id: userId,
    gmail_send_address: "configured@example.com",
  });
  tables.opportunities.push({
    id: opportunityId,
    user_id: userId,
    stage: "sending",
    selected_draft_id: hasDraft ? draftId : null,
    recipient_email: hasRecipient ? "buyer@example.com" : null,
    recipient_name: "Dana Buyer",
  });
  tables.email_drafts.push({
    id: draftId,
    user_id: userId,
    subject: "Hello",
    body: "Worth comparing notes?",
  });
}

function pick(row: MockRow, fields: string | null): MockRow {
  if (!fields || fields === "*") return { ...row };
  const out: MockRow = {};
  for (const field of fields.split(",").map((value) => value.trim())) {
    out[field] = row[field];
  }
  return out;
}

function createMockSupabase(options: {
  reserved?: boolean;
  rpcError?: string;
} = {}): SupabaseClient {
  function buildQuery(table: string) {
    const filters: Array<(row: MockRow) => boolean> = [];
    let selectedFields: string | null = null;

    const chain = {
      select(fields?: string) {
        selectedFields = fields ?? "*";
        return chain;
      },
      eq(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
        return chain;
      },
      single() {
        return Promise.resolve(resolveOne(table, filters, selectedFields));
      },
      maybeSingle() {
        return Promise.resolve(resolveOne(table, filters, selectedFields));
      },
    };

    return chain;
  }

  const client = {
    from(table: string) {
      return buildQuery(table);
    },
    rpc(name: string) {
      if (name !== "reserve_send_slot") {
        return Promise.resolve({
          data: null,
          error: { message: `Unexpected RPC: ${name}` },
        });
      }
      if (options.rpcError) {
        return Promise.resolve({
          data: null,
          error: { message: options.rpcError },
        });
      }
      return Promise.resolve({
        data: options.reserved ?? true,
        error: null,
      });
    },
  };

  return client as unknown as SupabaseClient;
}

function resolveOne(
  table: string,
  filters: Array<(row: MockRow) => boolean>,
  selectedFields: string | null,
): { data: MockRow | null; error: null } {
  const row =
    tables[table]?.find((candidate) => filters.every((f) => f(candidate))) ??
    null;
  return { data: row ? pick(row, selectedFields) : null, error: null };
}

function createAdvanceStage(options: {
  postSendResult?: "false" | "throw";
} = {}): {
  calls: Array<{
    expectedStage: OpportunityStage;
    newStage: OpportunityStage;
    updates: MockRow;
  }>;
  fn: AdvanceStageFn;
} {
  const calls: Array<{
    expectedStage: OpportunityStage;
    newStage: OpportunityStage;
    updates: MockRow;
  }> = [];

  const fn: AdvanceStageFn = async (
    _svc,
    id,
    targetUserId,
    expectedStage,
    newStage,
    updates = {},
  ) => {
    calls.push({ expectedStage, newStage, updates });
    if (newStage === "sent" && options.postSendResult === "throw") {
      throw new Error("database write failed");
    }
    if (newStage === "sent" && options.postSendResult === "false") {
      return false;
    }

    const opp = tables.opportunities.find(
      (row) => row.id === id && row.user_id === targetUserId,
    );
    if (!opp || opp.stage !== expectedStage) return false;
    Object.assign(opp, updates, { stage: newStage });
    return true;
  };

  return { calls, fn };
}

function createTestLogger(): Logger {
  const logger: Logger = {
    context: {},
    info() {},
    warn() {},
    error() {},
    child() {
      return logger;
    },
  };
  return logger;
}

async function runSend(options: {
  hasDraft?: boolean;
  hasRecipient?: boolean;
  sendThrows?: boolean;
  eventThrows?: boolean;
  postSendResult?: "false" | "throw";
} = {}) {
  resetTables(options);
  const advance = createAdvanceStage({
    postSendResult: options.postSendResult,
  });
  const events: OutreachEventInput[] = [];
  let sendCalls = 0;

  const sendEmailImpl: SendEmailFn = async () => {
    sendCalls += 1;
    if (options.sendThrows) {
      throw new Error("gmail down");
    }
    return { threadId: "thread-1", messageId: "message-1" };
  };

  const result = await approveOpportunityForSend(
    {
      userId,
      userEmail: "fallback@example.com",
      opportunityId,
    },
    {
      svc: createMockSupabase(),
      log: createTestLogger(),
      now: () => new Date(sentAt),
      advanceStageImpl: advance.fn,
      getGmailClientImpl: async () => ({}),
      sendEmailImpl,
      recordOutreachEventImpl: async (_svc, input) => {
        events.push(input);
        if (options.eventThrows) {
          throw new Error("event insert failed");
        }
      },
    },
  );

  return {
    result,
    advanceCalls: advance.calls,
    events,
    sendCalls,
    opportunity: tables.opportunities[0],
  };
}

async function testMissingDraftRevertsBeforeGmail(): Promise<void> {
  const run = await runSend({ hasDraft: false });

  assert.equal(run.result.ok, false);
  assert.equal(run.result.error, "Missing draft or recipient email");
  assert.equal(run.sendCalls, 0);
  assert.equal(run.opportunity.stage, "queued");
  assert.equal(run.advanceCalls[0].newStage, "queued");
}

async function testGmailFailureRevertsToQueued(): Promise<void> {
  const run = await runSend({ sendThrows: true });

  assert.equal(run.result.ok, false);
  assert.equal(run.result.error, "gmail down");
  assert.equal(run.sendCalls, 1);
  assert.equal(run.opportunity.stage, "queued");
  assert.equal(run.opportunity.last_error, "gmail down");
}

async function testPostSendPreconditionMissReturnsReconciliation(): Promise<void> {
  const run = await runSend({ postSendResult: "false" });

  assert.equal(run.result.ok, false);
  assert.match(run.result.error ?? "", /status update failed/);
  assert.equal(run.sendCalls, 1);
  assert.equal(run.opportunity.stage, "sending");
  assert.equal(run.events.length, 0);
}

async function testPostSendThrowReturnsReconciliation(): Promise<void> {
  const run = await runSend({ postSendResult: "throw" });

  assert.equal(run.result.ok, false);
  assert.match(run.result.error ?? "", /status update failed/);
  assert.equal(run.opportunity.stage, "sending");
  assert.equal(run.events.length, 0);
}

async function testSuccessRecordsEvent(): Promise<void> {
  const run = await runSend();

  assert.equal(run.result.ok, true);
  assert.equal(run.opportunity.stage, "sent");
  assert.equal(run.opportunity.gmail_thread_id, "thread-1");
  assert.equal(run.opportunity.gmail_message_id, "message-1");
  assert.equal(run.opportunity.sent_at, sentAt);
  assert.equal(run.events.length, 1);
  assert.equal(run.events[0].emailDraftId, draftId);
  assert.equal(run.events[0].eventType, "sent");
}

async function testEventFailureRemainsSuccessfulAfterSent(): Promise<void> {
  const run = await runSend({ eventThrows: true });

  assert.equal(run.result.ok, true);
  assert.equal(run.opportunity.stage, "sent");
  assert.equal(run.events.length, 1);
}

async function main(): Promise<void> {
  await testMissingDraftRevertsBeforeGmail();
  await testGmailFailureRevertsToQueued();
  await testPostSendPreconditionMissReturnsReconciliation();
  await testPostSendThrowReturnsReconciliation();
  await testSuccessRecordsEvent();
  await testEventFailureRemainsSuccessfulAfterSent();
  console.log("approve send tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
