import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordAccountOutcomeForUser,
  type AccountOutcome,
} from "../src/app/(app)/gtm/accounts/outcomes";
import type { RecordOutreachEventInput } from "../src/lib/outreach/events";
import type { OpportunityStage } from "../src/lib/supabase/types";

interface OpportunityFixture {
  id: string;
  user_id: string;
  source: string;
  stage: OpportunityStage;
  selected_draft_id: string | null;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

const USER_ID = "3583ae5c-f2db-4eae-a79f-bd7c5ec2fce8";
const OPPORTUNITY_ID = "9bb1a5f4-227c-4a1a-a7d8-481d19d94abc";
const DRAFT_ID = "452f4585-0dff-41e3-b4a3-ee947c4b44d1";
const FORGED_DRAFT_ID = "e9da06a6-2bec-46a4-93cc-9941ea675d2f";

class OpportunityQuery {
  private id: string | null = null;
  private userId: string | null = null;

  constructor(private readonly row: OpportunityFixture | null) {}

  select(): this {
    return this;
  }

  eq(column: string, value: string): this {
    if (column === "id") this.id = value;
    if (column === "user_id") this.userId = value;
    return this;
  }

  async maybeSingle<T>(): Promise<QueryResult<T>> {
    if (!this.row || this.row.id !== this.id || this.row.user_id !== this.userId) {
      return { data: null, error: null };
    }
    return { data: this.row as T, error: null };
  }
}

class MockSupabase {
  public updateCalled = false;

  constructor(private readonly row: OpportunityFixture | null) {}

  from(table: string): OpportunityQuery {
    assert.equal(table, "opportunities", "only opportunities should be queried");
    return new OpportunityQuery(this.row);
  }

  update(): never {
    this.updateCalled = true;
    throw new Error("manual outcomes must not update opportunity stage");
  }
}

function createRecorder(calls: RecordOutreachEventInput[]) {
  return async (
    _svc: SupabaseClient,
    input: RecordOutreachEventInput,
  ): Promise<{ id: string }> => {
    calls.push(input);
    return { id: "event-1" };
  };
}

function account(row: Partial<OpportunityFixture> = {}): OpportunityFixture {
  return {
    id: OPPORTUNITY_ID,
    user_id: USER_ID,
    source: "theirstack",
    stage: "queued",
    selected_draft_id: DRAFT_ID,
    ...row,
  };
}

async function runCase(row: OpportunityFixture | null, outcome: AccountOutcome) {
  const svc = new MockSupabase(row);
  const calls: RecordOutreachEventInput[] = [];
  const result = await recordAccountOutcomeForUser(
    svc as unknown as SupabaseClient,
    {
      userId: USER_ID,
      opportunityId: OPPORTUNITY_ID,
      emailDraftId: FORGED_DRAFT_ID,
      outcome,
    },
    createRecorder(calls),
  );

  return { svc, calls, result };
}

async function main() {
  const missing = await runCase(null, "positive_reply");
  assert.equal(missing.result.ok, false, "missing opportunity is rejected");
  assert.equal(missing.result.error, "Account not found");
  assert.equal(missing.calls.length, 0, "missing opportunity writes no event");

  const wrongSource = await runCase(account({ source: "jsearch" }), "bad_fit");
  assert.equal(wrongSource.result.ok, false, "non-GTM source is rejected");
  assert.equal(wrongSource.calls.length, 0, "non-GTM source writes no event");

  const sending = await runCase(account({ stage: "sending" }), "booked");
  assert.equal(sending.result.ok, false, "sending row is rejected");
  assert.equal(sending.calls.length, 0, "sending row writes no event");

  const invalidOutcome = await recordAccountOutcomeForUser(
    new MockSupabase(account()) as unknown as SupabaseClient,
    {
      userId: USER_ID,
      opportunityId: OPPORTUNITY_ID,
      outcome: "won",
    },
    createRecorder([]),
  );
  assert.equal(invalidOutcome.ok, false, "invalid outcome is rejected");

  const valid = await runCase(
    account({ source: "exa-dormant" }),
    "manual_conversion",
  );
  assert.equal(valid.result.ok, true, "valid GTM account outcome is accepted");
  assert.equal(
    valid.svc.updateCalled,
    false,
    "manual outcome does not update stage",
  );
  assert.deepEqual(
    valid.calls,
    [
      {
        userId: USER_ID,
        opportunityId: OPPORTUNITY_ID,
        emailDraftId: DRAFT_ID,
        eventType: "manual_outcome",
        source: "accounts",
        metadata: { outcome: "manual_conversion" },
      },
    ],
    "valid outcome writes the expected outreach event payload",
  );

  const calls: RecordOutreachEventInput[] = [];
  const failedWrite = await recordAccountOutcomeForUser(
    new MockSupabase(account()) as unknown as SupabaseClient,
    {
      userId: USER_ID,
      opportunityId: OPPORTUNITY_ID,
      outcome: "positive_reply",
    },
    async (_svc, input) => {
      calls.push(input);
      throw new Error("insert failed");
    },
  );
  assert.equal(failedWrite.ok, false, "recorder failure returns an error");
  assert.equal(failedWrite.error, "insert failed");

  console.log("PASS: account manual outcomes");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
