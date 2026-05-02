import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordOutreachEvent } from "../src/lib/outreach/events";

type InsertPayload = Record<string, unknown>;

function createMockSupabase(options?: {
  insertError?: { message: string };
  onInsert?: (table: string, payload: InsertPayload) => void;
}): SupabaseClient {
  const client = {
    from(table: string) {
      return {
        insert(payload: InsertPayload) {
          options?.onInsert?.(table, payload);
          return Promise.resolve({ error: options?.insertError ?? null });
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}

async function testRequiredInsertShape(): Promise<void> {
  let capturedTable = "";
  let capturedPayload: InsertPayload | null = null;
  const svc = createMockSupabase({
    onInsert(table, payload) {
      capturedTable = table;
      capturedPayload = payload;
    },
  });

  await recordOutreachEvent(svc, {
    userId: "user-1",
    opportunityId: "opp-1",
    eventType: "reply_detected",
    source: "reply_cron",
  });

  assert.equal(capturedTable, "outreach_events");
  assert.deepEqual(capturedPayload, {
    user_id: "user-1",
    opportunity_id: "opp-1",
    event_type: "reply_detected",
    source: "reply_cron",
    metadata: {},
  });
}

async function testOptionalInsertShape(): Promise<void> {
  let capturedPayload: InsertPayload | null = null;
  const svc = createMockSupabase({
    onInsert(_table, payload) {
      capturedPayload = payload;
    },
  });

  await recordOutreachEvent(svc, {
    userId: "user-2",
    opportunityId: "opp-2",
    emailDraftId: "draft-2",
    eventType: "sent",
    source: "approve_send_action",
    metadata: { gmailThreadId: "thread-2" },
    occurredAt: "2026-05-01T23:00:00.000Z",
  });

  assert.deepEqual(capturedPayload, {
    user_id: "user-2",
    opportunity_id: "opp-2",
    email_draft_id: "draft-2",
    event_type: "sent",
    source: "approve_send_action",
    metadata: { gmailThreadId: "thread-2" },
    occurred_at: "2026-05-01T23:00:00.000Z",
  });
}

async function testInsertErrorThrows(): Promise<void> {
  const svc = createMockSupabase({
    insertError: { message: "constraint failed" },
  });

  await assert.rejects(
    () =>
      recordOutreachEvent(svc, {
        userId: "user-3",
        opportunityId: "opp-3",
        eventType: "sent",
        source: "approve_send_action",
      }),
    /recordOutreachEvent failed: constraint failed/,
  );
}

async function main(): Promise<void> {
  await testRequiredInsertShape();
  await testOptionalInsertShape();
  await testInsertErrorThrows();
  console.log("outreach event tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
