#!/usr/bin/env tsx
import { strict as assert } from "node:assert";
import { config } from "dotenv";
import { __setRunClaudeJsonForTests } from "../src/lib/ai/anthropic";
import { draftOneGtmAccount } from "../src/lib/pipeline/steps/draft-gtm";
import type { OpportunityStage } from "../src/lib/supabase/types";
import { canApproveAccountDraft } from "../src/app/(app)/_components/account-card-draft-section-helpers";

config({ path: ".env.local" });

interface MockRow {
  [key: string]: unknown;
}

const userId = "user-gtm-send-path";
const opportunityId = "opp-gtm-send-path";
const tables: Record<string, MockRow[]> = {
  opportunities: [],
  email_drafts: [],
  memory_documents: [],
  profiles: [],
  user_scoring_profiles: [],
  research_reports: [],
};

let idCounter = 0;

function resetTables(): void {
  for (const rows of Object.values(tables)) rows.length = 0;
  idCounter = 0;
  tables.profiles.push({ user_id: userId, display_name: "Avery Chen" });
  tables.memory_documents.push({
    user_id: userId,
    document_key: "icp_narrative_arc",
    title: "ICP Narrative Arc",
    content: "## Trigger\n\nPipeline coverage is under board scrutiny.",
  });
  tables.user_scoring_profiles.push({
    user_id: userId,
    icp_rubric: {
      buyer: {
        economic_buyer: "VP Sales",
        champion: "RevOps",
        end_user: "SDR Manager",
        deal_blocker: "Security",
      },
    },
  });
  tables.opportunities.push({
    id: opportunityId,
    user_id: userId,
    source: "theirstack",
    external_id: "job-1",
    company_name: "Acme",
    company_domain: "acme.example",
    role_title: "VP Sales",
    stage: "enriched",
    selected_draft_id: null,
    recipient_name: "Dana Buyer",
    recipient_title: "VP Sales",
    recipient_email: "dana@acme.example",
    buyer_personas: [
      {
        name: "Dana Buyer",
        title: "VP Sales",
        description: "Owns pipeline creation.",
        email: "dana@acme.example",
      },
    ],
    trigger_signals: [{ hiring_role: "SDR" }],
    research_id: null,
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

function createMockSupabase() {
  function buildQuery(table: string) {
    const filters: Array<(row: MockRow) => boolean> = [];
    let selectFields: string | null = null;
    let limitCount: number | null = null;
    let orderField: string | null = null;
    let orderAsc = true;
    let pendingInsert: MockRow | null = null;
    let pendingUpdate: Partial<MockRow> | null = null;

    function resolve() {
      if (pendingInsert) {
        const row = { id: `draft-${++idCounter}`, ...pendingInsert };
        tables[table].push(row);
        return { data: [pick(row, selectFields)], error: null };
      }

      let rows = tables[table].filter((row) => filters.every((f) => f(row)));
      if (pendingUpdate) {
        for (const row of rows) Object.assign(row, pendingUpdate);
      }
      if (orderField) {
        rows = [...rows].sort((a, b) => {
          const left = String(a[orderField!] ?? "");
          const right = String(b[orderField!] ?? "");
          const cmp = left < right ? -1 : left > right ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitCount != null) rows = rows.slice(0, limitCount);
      const data = rows.map((row) => pick(row, selectFields));
      return { data, error: null };
    }

    const chain = {
      select(fields?: string) {
        selectFields = fields ?? "*";
        return chain;
      },
      eq(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
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
        const result = resolve();
        return { data: result.data[0] ?? null, error: result.error };
      },
      maybeSingle() {
        const result = resolve();
        return { data: result.data[0] ?? null, error: result.error };
      },
      then(onFulfilled: (value: { data: MockRow[]; error: null }) => unknown) {
        return Promise.resolve(resolve()).then(onFulfilled);
      },
    };

    return {
      chain,
      setInsert(row: MockRow) {
        pendingInsert = row;
      },
      setUpdate(row: Partial<MockRow>) {
        pendingUpdate = row;
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
      };
    },
  };
}

async function testDraftQueuesGtmAccount(): Promise<void> {
  resetTables();
  __setRunClaudeJsonForTests(async () => ({
    subject: "Pipeline coverage",
    body: "Saw Acme is scaling SDR hiring. Worth comparing notes?",
    reasoning: "Uses the trigger and buyer role.",
  }));

  const result = await draftOneGtmAccount(
    createMockSupabase() as never,
    userId,
    opportunityId,
    "run-test",
  );

  const opp = tables.opportunities[0];
  const draft = tables.email_drafts[0];
  assert.equal(result.drafted?.id, draft.id, "returns inserted draft id");
  assert.equal(draft.draft_type, "icp-account-outreach");
  assert.equal(draft.opportunity_id, opportunityId);
  assert.equal(opp.selected_draft_id, draft.id);
  assert.equal(opp.stage, "queued");
}

async function testExistingDraftedAccountQueues(): Promise<void> {
  resetTables();
  const existingDraftId = "draft-existing";
  tables.opportunities[0].stage = "drafted";
  tables.email_drafts.push({
    id: existingDraftId,
    user_id: userId,
    opportunity_id: opportunityId,
    draft_type: "icp-account-outreach",
    subject: "Existing subject",
    body: "Existing body",
    created_at: "2026-05-01T00:00:00.000Z",
  });
  __setRunClaudeJsonForTests(() => {
    throw new Error("existing draft path should not call the model");
  });

  const result = await draftOneGtmAccount(
    createMockSupabase() as never,
    userId,
    opportunityId,
    "run-existing",
  );

  assert.equal(result.skipped, "already_drafted");
  assert.equal(tables.opportunities[0].selected_draft_id, existingDraftId);
  assert.equal(tables.opportunities[0].stage, "queued");
  assert.equal(tables.email_drafts.length, 1, "does not create duplicate draft");
}

function testApproveVisibility(): void {
  const base = {
    draftId: "draft-1",
    opportunityId: "opp-1",
    recipientEmail: "buyer@example.com",
  };
  assert.equal(
    canApproveAccountDraft({ ...base, stage: "queued" }),
    true,
    "queued draft with recipient is approvable",
  );
  for (const stage of ["drafted", "sending", "sent", "replied", "skipped"]) {
    assert.equal(
      canApproveAccountDraft({ ...base, stage: stage as OpportunityStage }),
      false,
      `${stage} draft is not approvable`,
    );
  }
  assert.equal(canApproveAccountDraft({ ...base, draftId: undefined, stage: "queued" }), false);
  assert.equal(canApproveAccountDraft({ ...base, opportunityId: undefined, stage: "queued" }), false);
  assert.equal(canApproveAccountDraft({ ...base, recipientEmail: null, stage: "queued" }), false);
}

async function main(): Promise<void> {
  try {
    await testDraftQueuesGtmAccount();
    await testExistingDraftedAccountQueues();
    testApproveVisibility();
    console.log("GTM send path assertions passed.");
  } finally {
    __setRunClaudeJsonForTests(null);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
