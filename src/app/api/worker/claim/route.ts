import { NextResponse, type NextRequest } from "next/server";
import { claimAndRun } from "@/lib/jobs/worker";

const ALL_JOB_TYPES = [
  "company-fit-analyzer",
  "full-analysis",
  "people-research",
  "career-coach",
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

  const body = await request.json().catch(() => ({}));
  const types = Array.isArray(body.types) ? body.types : ALL_JOB_TYPES;

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
