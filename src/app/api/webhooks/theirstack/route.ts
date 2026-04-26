/**
 * POST /api/webhooks/theirstack?user=<uuid>
 *
 * Real-time inbound lane for TheirStack `job.new` events. When a saved
 * search in the TheirStack dashboard matches a new posting, the event
 * hits this endpoint within seconds instead of waiting for the next
 * /api/cron/pipeline tick.
 *
 * Flow:
 *   verify HMAC-SHA256 signature over raw body  →  parse as TheirStack
 *   job shape (zod)  →  insert opportunity with source='theirstack'
 *   (unique constraint dedups duplicate deliveries)  →  claim  →
 *   scoreOneAccount (analysis + stage advance + watchlist side effect)
 *   →  release.
 *
 * Setup (one-time, out-of-code):
 *   1. Create a saved search in the TheirStack dashboard that matches
 *      the user's rubric filters (or use a superset; the ICP scorer
 *      filters downstream).
 *   2. Point `job.new` at `https://<host>/api/webhooks/theirstack?user=<userId>`.
 *   3. Set `THEIRSTACK_WEBHOOK_SIGNING_SECRET` in env.
 *
 * The /api/cron/pipeline sweep continues to run every 6 hours as a
 * fallback for missed webhooks.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { jobSchema } from "@/lib/integrations/theirstack";
import { icpRubricSchema } from "@/lib/onboarding/icp-schemas";
import { createOpportunity } from "@/lib/pipeline/opportunities";
import {
  claimOpportunity,
  releaseOpportunity,
} from "@/lib/pipeline/opportunities";
import { scoreOneAccount } from "@/lib/pipeline/steps/score-accounts";
import { enqueueGtmFindContactsJob } from "@/lib/jobs/gtm-find-contacts";
import type { OpportunityRow, PipelineConfigRow } from "@/lib/supabase/types";
import { createLogger, newRunId } from "@/lib/logger";

export const maxDuration = 60;

// TheirStack sends HMAC-SHA256 of the raw request body in the
// `X-TheirStack-Signature-256` header, formatted as `sha256=<hex>`
// (docs: theirstack.com/en/docs/webhooks/verify-webhook-signatures).
// Header lookup is case-insensitive via Headers.get.
const SIGNATURE_HEADER = "x-theirstack-signature-256";

// TheirStack's real `job.new` envelope is { id, type: "job.new", payload: {...job} }
// (docs: theirstack.com/en/docs/webhooks/event-type/webhook_job_new).
// We also accept `job` as a back-compat alias so existing synthetic test
// scripts continue to work.
const payloadSchema = z
  .object({
    type: z.string().optional(),
    payload: jobSchema.optional(),
    job: jobSchema.optional(),
  })
  .passthrough()
  .refine((v) => v.payload != null || v.job != null, {
    message: "body must contain `payload` (TheirStack) or `job` (legacy)",
  });

// PostgrestError from @supabase/postgrest-js is a plain object (not an
// Error instance), so a naive `String(err)` coerces to "[object Object]"
// and hides the actual failure. Extract the useful fields explicitly and
// fall back to JSON for anything else.
function formatError(err: unknown): {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
} {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const message =
      typeof e.message === "string" && e.message.length > 0
        ? e.message
        : JSON.stringify(err);
    const out: {
      message: string;
      code?: string;
      details?: string;
      hint?: string;
    } = { message };
    if (typeof e.code === "string") out.code = e.code;
    if (typeof e.details === "string") out.details = e.details;
    if (typeof e.hint === "string") out.hint = e.hint;
    return out;
  }
  return { message: String(err) };
}

function verifySignature(
  secret: string,
  rawBody: string,
  providedSignature: string | null,
): boolean {
  if (!providedSignature) return false;
  // Support both `sha256=<hex>` (GitHub/Slack style) and bare hex.
  const normalized = providedSignature.startsWith("sha256=")
    ? providedSignature.slice("sha256=".length)
    : providedSignature;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(normalized, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const runId = newRunId();
  const log = createLogger({ runId, scope: "webhook.theirstack" });

  const secret = process.env.THEIRSTACK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    log.error("THEIRSTACK_WEBHOOK_SIGNING_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user");
  if (!userId) {
    log.warn("missing ?user=<uuid>");
    return new Response("Missing user", { status: 400 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);

  if (!verifySignature(secret, rawBody, signature)) {
    log.warn("signature verification failed", { userId });
    return new Response("Invalid signature", { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const payload = payloadSchema.safeParse(parsedBody);
  if (!payload.success) {
    // Non-PII shape probe so we can learn TheirStack's real envelope
    // from production deliveries. Keys only — no values, no job content.
    const topLevelKeys =
      parsedBody && typeof parsedBody === "object"
        ? Object.keys(parsedBody as Record<string, unknown>)
        : [];
    const dataKeys =
      parsedBody &&
      typeof parsedBody === "object" &&
      (parsedBody as Record<string, unknown>).data &&
      typeof (parsedBody as Record<string, unknown>).data === "object"
        ? Object.keys((parsedBody as { data: Record<string, unknown> }).data)
        : null;
    log.warn("payload shape rejected", {
      issue: payload.error.message,
      topLevelKeys,
      dataKeys,
    });
    return NextResponse.json(
      {
        ok: false,
        error: `Payload validation failed: ${payload.error.message}`,
      },
      { status: 400 },
    );
  }

  // refine above guarantees at least one is present
  const job = (payload.data.payload ?? payload.data.job)!;
  const userLog = log.child({ userId, jobId: job.id });

  // Payload-level guards run BEFORE the rubric / config DB lookups so
  // we don't pay a round-trip for rows we're going to drop anyway. The
  // non-null company_domain contract mirrors runDiscoverAccounts +
  // runAccountActivationSearch — dormant dedup and the scoring prompt
  // both rely on it, so the webhook lane can't be the one that leaks
  // nulls in.
  const companyName = job.company_object?.name ?? job.company ?? null;
  if (!companyName) {
    userLog.warn("job missing company name — skipping");
    return NextResponse.json({ ok: true, skipped: "no company name" });
  }
  const companyDomain =
    job.company_object?.domain ?? job.company_domain ?? null;
  if (!companyDomain) {
    userLog.warn("job missing company_domain — skipping", { companyName });
    return NextResponse.json({ ok: true, skipped: "no company_domain" });
  }

  const svc = createSupabaseServiceClient();

  const [scoringRes, configRes] = await Promise.all([
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
    svc.from("pipeline_config").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const rawRubric = scoringRes.data?.icp_rubric ?? null;
  const config = configRes.data as PipelineConfigRow | null;

  if (!rawRubric || !config) {
    userLog.warn("user missing rubric or pipeline_config — 422");
    return NextResponse.json(
      {
        ok: false,
        error: "User has no confirmed ICP rubric or pipeline config",
      },
      { status: 422 },
    );
  }

  const rubric = icpRubricSchema.safeParse(rawRubric);
  if (!rubric.success) {
    userLog.error("icp_rubric failed schema validation", rubric.error);
    return NextResponse.json(
      {
        ok: false,
        error: `icp_rubric invalid: ${rubric.error.message}`,
      },
      { status: 422 },
    );
  }

  let created: OpportunityRow | null;
  try {
    created = await createOpportunity(svc, userId, {
      source: "theirstack",
      external_id: job.id,
      company_name: companyName,
      company_domain: companyDomain,
      role_title: job.job_title,
      job_url: job.url ?? undefined,
      job_description: job.description ?? undefined,
      job_posted_at: job.date_posted ?? undefined,
      trigger_signals: [
        {
          funding_stage: job.company_object?.funding_stage ?? null,
          employee_count: job.company_object?.employee_count ?? null,
          industry_id: job.company_object?.industry_id ?? null,
          industry: job.company_object?.industry ?? null,
          annual_revenue_usd: job.company_object?.annual_revenue_usd ?? null,
          country_code: job.company_object?.country_code ?? null,
          posted_at: job.date_posted ?? null,
          source: "theirstack-webhook",
        },
      ],
      buyer_personas: [
        {
          hiring_for: job.job_title,
          seniority: job.seniority ?? null,
          location: job.short_location ?? job.location ?? null,
          remote: job.remote ?? null,
          source: "theirstack-webhook",
        },
      ],
    });
  } catch (err) {
    const formatted = formatError(err);
    userLog.error("opportunity insert failed", err, formatted);
    return NextResponse.json(
      { ok: false, error: formatted.message, ...formatted },
      { status: 500 },
    );
  }

  if (!created) {
    userLog.info("duplicate webhook delivery — opportunity already exists");
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const claimed = await claimOpportunity(svc, created.id, userId);
    if (!claimed) {
      // Another cron run is scoring this row. Not a failure — return 200
      // so TheirStack doesn't retry the webhook.
      userLog.info("opportunity already claimed by another process");
      return NextResponse.json({
        ok: true,
        opportunityId: created.id,
        claimed: false,
      });
    }

    const { newStage, normalizedScore } = await scoreOneAccount(
      svc,
      userId,
      created,
      rubric.data,
      config,
      { runId },
    );
    await releaseOpportunity(svc, created.id, userId);

    userLog.info("webhook scored", {
      oppId: created.id,
      newStage,
      normalizedScore,
    });

    if (newStage === "scored" && normalizedScore >= config.score_threshold) {
      try {
        const job = await enqueueGtmFindContactsJob(svc, {
          userId,
          opportunityId: created.id,
        });
        userLog.info("contact discovery job enqueued", {
          jobId: job.jobId,
          duplicate: job.duplicate,
        });
      } catch (enqueueErr) {
        userLog.error("contact discovery enqueue failed", enqueueErr, {
          oppId: created.id,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      opportunityId: created.id,
      newStage,
      normalizedScore,
    });
  } catch (err) {
    const formatted = formatError(err);
    userLog.error("scoring failed after insert", err, {
      oppId: created.id,
      ...formatted,
    });
    await svc
      .from("opportunities")
      .update({ last_error: formatted.message })
      .eq("id", created.id)
      .eq("user_id", userId);
    await releaseOpportunity(svc, created.id, userId);

    return NextResponse.json({
      ok: true,
      opportunityId: created.id,
      scored: false,
      error: formatted.message,
      ...(formatted.code ? { code: formatted.code } : {}),
    });
  }
}
