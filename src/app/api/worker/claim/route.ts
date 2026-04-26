import { NextResponse, type NextRequest } from "next/server";
import { claimAndRun } from "@/lib/jobs/worker";

const ALL_JOB_TYPES = [
  "company-fit-analyzer",
  "full-analysis",
  "people-research",
  "career-coach",
  "gtm-find-contacts",
];

/**
 * POST /api/worker/claim
 *
 * Called by enqueue fire-and-forget or external cron. Picks up one pending
 * job, runs it, and writes results. Protected by WORKER_INVOKE_SECRET.
 */
export async function POST(request: NextRequest) {
  // Always require WORKER_INVOKE_SECRET — never allow unauthenticated access
  // to prevent unauthorized triggering of expensive Anthropic/Exa calls.
  const secret = process.env.WORKER_INVOKE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "WORKER_INVOKE_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const parsed = body as Record<string, unknown>;
  const types = Array.isArray(parsed.types) ? parsed.types : ALL_JOB_TYPES;

  const job = await claimAndRun(types);

  if (!job) {
    return NextResponse.json({ claimed: false }, { status: 200 });
  }

  return NextResponse.json({
    claimed: true,
    jobId: job.id,
    type: job.type,
    status: job.status,
  });
}
