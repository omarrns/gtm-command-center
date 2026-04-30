#!/usr/bin/env tsx
/**
 * Regression gate for video-icp-review job failure propagation.
 *
 * This avoids live Supabase, yt-dlp, and model calls. It exercises claimAndRun()
 * with a mocked claimed job and a forced handler failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { __setSupabaseServiceClientForTests } from "../src/lib/supabase/service";
import type { JobRow } from "../src/lib/supabase/types";
import {
  __setJobHandlerForTests,
  claimAndRun,
} from "../src/lib/jobs/worker";

const VALID_REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const ERROR_MESSAGE = "forced Video ICP failure";

type UpdateCall = {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

class MockSupabase {
  readonly updates: UpdateCall[] = [];

  constructor(private readonly job: JobRow) {}

  async rpc(name: string, args: Record<string, unknown>) {
    if (name !== "claim_next_job") {
      throw new Error(`Unexpected rpc: ${name}`);
    }
    const types = args.worker_types;
    if (!Array.isArray(types) || !types.includes(this.job.type)) {
      return { data: null, error: null };
    }
    return { data: this.job, error: null };
  }

  from(table: string) {
    return {
      update: (payload: Record<string, unknown>) => {
        const call: UpdateCall = { table, payload, filters: [] };
        this.updates.push(call);
        return {
          eq: (field: string, value: unknown) => {
            call.filters.push([field, value]);
            return {
              eq: (nextField: string, nextValue: unknown) => {
                call.filters.push([nextField, nextValue]);
                return Promise.resolve({ error: null });
              },
              then: (
                onFulfilled: (value: { error: null }) => unknown,
                onRejected?: (reason: unknown) => unknown,
              ) => Promise.resolve({ error: null }).then(onFulfilled, onRejected),
            };
          },
        };
      },
    };
  }
}

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS: ${message}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL: ${message}`);
}

function createJob(payload: Record<string, unknown>): JobRow {
  return {
    id: JOB_ID,
    user_id: USER_ID,
    type: "video-icp-review",
    status: "pending",
    payload,
    result: null,
    error: null,
    created_at: "2026-04-30T00:00:00.000Z",
    updated_at: "2026-04-30T00:00:00.000Z",
  };
}

async function runScenario(payload: Record<string, unknown>) {
  const mock = new MockSupabase(createJob(payload));
  __setSupabaseServiceClientForTests(
    () => mock as unknown as SupabaseClient,
  );
  __setJobHandlerForTests("video-icp-review", async () => {
    throw new Error(ERROR_MESSAGE);
  });

  try {
    const claimed = await claimAndRun(["video-icp-review"]);
    assert(claimed?.id === JOB_ID, "claimAndRun returns the claimed job");
    return mock.updates;
  } finally {
    __setJobHandlerForTests("video-icp-review", null);
    __setSupabaseServiceClientForTests(null);
  }
}

function hasFilter(call: UpdateCall, field: string, value: unknown): boolean {
  return call.filters.some(
    ([filterField, filterValue]) =>
      filterField === field && filterValue === value,
  );
}

async function main() {
  console.log("Video ICP review job failure propagation\n");

  const validUpdates = await runScenario({ review_id: VALID_REVIEW_ID });
  const jobUpdate = validUpdates.find((call) => call.table === "jobs");
  const reviewUpdate = validUpdates.find(
    (call) => call.table === "video_icp_reviews",
  );

  assert(
    jobUpdate?.payload.status === "failed" &&
      jobUpdate.payload.error === ERROR_MESSAGE &&
      hasFilter(jobUpdate, "id", JOB_ID),
    "failing job marks jobs row failed with the handler error",
  );

  assert(
    reviewUpdate?.payload.status === "failed" &&
      reviewUpdate.payload.error === ERROR_MESSAGE &&
      hasFilter(reviewUpdate, "id", VALID_REVIEW_ID) &&
      hasFilter(reviewUpdate, "user_id", USER_ID),
    "valid review_id marks video_icp_reviews row failed with the same error",
  );

  const invalidUpdates = await runScenario({ review_id: "not-a-uuid" });
  assert(
    invalidUpdates.some((call) => call.table === "jobs"),
    "invalid review_id still marks the jobs row failed",
  );
  assert(
    !invalidUpdates.some((call) => call.table === "video_icp_reviews"),
    "invalid review_id does not update video_icp_reviews",
  );

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  __setJobHandlerForTests("video-icp-review", null);
  __setSupabaseServiceClientForTests(null);
  console.error(err);
  process.exit(1);
});
