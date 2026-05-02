#!/usr/bin/env tsx

import type { SupabaseClient } from "@supabase/supabase-js";
import { prospectIcpAnalysisSchema } from "../src/lib/prospects/schemas";
import { promoteProspectToOpportunity } from "../src/lib/prospects/promotion";
import type { ProspectRow } from "../src/lib/prospects/types";
import { upsertYoutubeCommentProspects } from "../src/lib/prospects/youtube";
import type { VideoIcpReviewRow } from "../src/lib/supabase/types";
import type { VideoIcpComment } from "../src/lib/video-icp/schemas";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS: ${message}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL: ${message}`);
}

class ProspectUpsertMock {
  rows: Record<string, unknown>[] = [];

  from(table: string) {
    if (table !== "prospects") throw new Error(`Unexpected table: ${table}`);
    return {
      upsert: (rows: Record<string, unknown>[]) => {
        this.rows = rows;
        return Promise.resolve({ error: null });
      },
    };
  }
}

class PromotionMock {
  opportunityInsert: Record<string, unknown> | null = null;
  prospectUpdate: Record<string, unknown> | null = null;

  from(table: string) {
    if (table === "opportunities") return this.opportunities();
    if (table === "prospects") return this.prospects();
    throw new Error(`Unexpected table: ${table}`);
  }

  private opportunities() {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        this.opportunityInsert = row;
        return {
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: "opportunity-1", ...row },
                error: null,
              }),
          }),
        };
      },
    };
  }

  private prospects() {
    return {
      update: (row: Record<string, unknown>) => {
        this.prospectUpdate = row;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      },
    };
  }
}

const review: VideoIcpReviewRow = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  job_id: null,
  youtube_url: "https://www.youtube.com/watch?v=abc123",
  video_id: "abc123",
  video_title: "Pipeline lessons",
  channel_title: "Demo Channel",
  duration_sec: 120,
  status: "complete",
  error: null,
  transcript: null,
  comments: null,
  comments_status: "fetched",
  comments_error: null,
  analysis: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

const comments: VideoIcpComment[] = [
  {
    id: "comment-1",
    parentId: "root",
    text: "We are evaluating RevOps tools at Acme.",
    author: "Dana",
    authorId: "channel-1",
    authorIsUploader: false,
    authorIsVerified: false,
    isPinned: false,
    isFavorited: false,
    likeCount: 7,
    timestampSec: 42,
  },
  {
    id: "comment-2",
    parentId: "root",
    text: "Thanks for watching.",
    author: "Creator",
    authorId: "channel-creator",
    authorIsUploader: true,
    authorIsVerified: true,
    isPinned: false,
    isFavorited: false,
    likeCount: 1,
    timestampSec: 55,
  },
];

function createProspect(overrides: Partial<ProspectRow> = {}): ProspectRow {
  return {
    id: "prospect-1",
    user_id: review.user_id,
    source: "yt_comments",
    external_id: "youtube:abc123:comment-1",
    video_icp_review_id: review.id,
    display_name: "Dana",
    youtube_author_id: "channel-1",
    youtube_comment_id: "comment-1",
    youtube_channel_url: "https://www.youtube.com/channel/channel-1",
    company_name: "Acme",
    company_domain: "acme.com",
    company_confidence: "high",
    comment_text: comments[0]?.text ?? "",
    comment_like_count: 7,
    comment_timestamp_sec: 42,
    evidence: {},
    status: "scored",
    score: 83,
    score_components: { reason: "RevOps buying signal" },
    analysis_id: null,
    last_error: null,
    discovered_at: review.created_at,
    created_at: review.created_at,
    updated_at: review.updated_at,
    ...overrides,
  };
}

async function testUpsert() {
  const mock = new ProspectUpsertMock();
  const summary = await upsertYoutubeCommentProspects(
    mock as unknown as SupabaseClient,
    review,
    comments,
  );

  assert(summary.insertedOrUpdated === 1, "upserts one non-uploader comment");
  assert(summary.skippedUploader === 1, "skips uploader-owned comments");
  assert(
    mock.rows[0]?.external_id === "youtube:abc123:comment-1",
    "uses stable video/comment external id",
  );
}

async function testPromotion() {
  const mock = new PromotionMock();
  await promoteProspectToOpportunity({
    svc: mock as unknown as SupabaseClient,
    userId: review.user_id,
    prospect: createProspect(),
    config: { score_threshold: 70 },
  });

  assert(
    mock.opportunityInsert?.source === "yt_comments",
    "promotion creates a YouTube-sourced opportunity",
  );
  assert(
    mock.opportunityInsert?.prospect_id === "prospect-1",
    "promotion links opportunity back to prospect_id",
  );
  assert(
    mock.prospectUpdate?.status === "promoted",
    "promotion marks the prospect promoted",
  );
}

async function testPromotionRefusal() {
  const mock = new PromotionMock();
  let rejected = false;
  try {
    await promoteProspectToOpportunity({
      svc: mock as unknown as SupabaseClient,
      userId: review.user_id,
      prospect: createProspect({
        company_domain: null,
        company_confidence: "none",
      }),
      config: { score_threshold: 70 },
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "promotion refuses prospects without high-confidence company linkage");
}

function testSchema() {
  const parsed = prospectIcpAnalysisSchema.safeParse({
    score: 82,
    verdict: "promising",
    reason: "Comment shows RevOps buying pain.",
    fitSignals: ["RevOps tooling evaluation"],
    objectionsOrNeeds: ["Needs attribution clarity"],
    company: {
      name: "Acme",
      domain: "acme.com",
      confidence: "high",
      evidence: "Comment names Acme.",
    },
  });
  assert(parsed.success, "prospect scoring schema accepts valid output");

  const invalid = prospectIcpAnalysisSchema.safeParse({
    score: 200,
    verdict: "great",
    reason: "bad",
    fitSignals: [],
    objectionsOrNeeds: [],
    company: { name: null, domain: null, confidence: "sure", evidence: "" },
  });
  assert(!invalid.success, "prospect scoring schema rejects malformed output");
}

async function main() {
  console.log("YouTube prospects\n");
  await testUpsert();
  await testPromotion();
  await testPromotionRefusal();
  testSchema();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
