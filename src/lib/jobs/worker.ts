import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { JobRow } from "@/lib/supabase/types";
import { videoIcpJobPayloadSchema } from "@/lib/video-icp/schemas";
import { runCompanyFitAnalyzerJob } from "./handlers/company-fit-analyzer";
import { runFullAnalysisJob } from "./handlers/full-analysis";
import { runPeopleResearchJob } from "./handlers/people-research";
import { runCareerCoachJob } from "./handlers/career-coach";
import { runGtmFindContactsJob } from "./handlers/gtm-find-contacts";
import { runOnboardingArtifactAnalysisJob } from "./handlers/onboarding-artifact-analysis";
import { runVideoIcpReviewJob } from "./handlers/video-icp-review";

type JobHandler = (
  job: JobRow,
  svc: ReturnType<typeof createSupabaseServiceClient>,
) => Promise<Record<string, unknown>>;

/** Maps job type slug → handler function. */
const HANDLERS: Record<string, JobHandler> = {
  "company-fit-analyzer": runCompanyFitAnalyzerJob,
  "full-analysis": runFullAnalysisJob,
  "people-research": runPeopleResearchJob,
  "career-coach": runCareerCoachJob,
  "gtm-find-contacts": runGtmFindContactsJob,
  "onboarding-artifact-analysis": runOnboardingArtifactAnalysisJob,
  "video-icp-review": runVideoIcpReviewJob,
};

const testHandlers = new Map<string, JobHandler>();

export function __setJobHandlerForTests(
  type: string,
  handler: JobHandler | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot override job handlers in production.");
  }
  if (handler) {
    testHandlers.set(type, handler);
    return;
  }
  testHandlers.delete(type);
}

/**
 * Claim the oldest pending job matching any of `types`, run the handler, and
 * write the result (or error) back to the jobs row + domain table.
 *
 * Returns the claimed job row if one was found, else null.
 */
export async function claimAndRun(types: string[]): Promise<JobRow | null> {
  const svc = createSupabaseServiceClient();

  // Atomic claim via Postgres function
  const { data: claimed, error: claimError } = await svc.rpc("claim_next_job", {
    worker_types: types,
  });

  if (claimError || !claimed?.id) return null;
  const job = claimed as JobRow;

  const handler = testHandlers.get(job.type) ?? HANDLERS[job.type];
  if (!handler) {
    await svc
      .from("jobs")
      .update({ status: "failed", error: `Unknown job type: ${job.type}` })
      .eq("id", job.id);
    return job;
  }

  try {
    const result = await handler(job, svc);
    await svc
      .from("jobs")
      .update({ status: "complete", result })
      .eq("id", job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await svc
      .from("jobs")
      .update({ status: "failed", error: message })
      .eq("id", job.id);

    // Propagate failure to the domain row so the UI doesn't stay stuck on "running".
    await propagateFailureToDomainRow(job, svc, message);
  }

  return job;
}

/**
 * When a job fails, update the linked domain row (analyses, research_reports,
 * coaching_sessions, video_icp_reviews) so the UI shows "failed" instead of
 * staying on "running".
 */
async function propagateFailureToDomainRow(
  job: JobRow,
  svc: ReturnType<typeof createSupabaseServiceClient>,
  errorMessage?: string,
) {
  const payload = job.payload as Record<string, unknown>;

  const domainUpdates: Array<{
    table: string;
    idField: string;
    id: string;
    error?: string | null;
  }> = [];

  if (payload.analysis_id) {
    domainUpdates.push({
      table: "analyses",
      idField: "id",
      id: payload.analysis_id as string,
    });
  }
  if (payload.report_id) {
    domainUpdates.push({
      table: "research_reports",
      idField: "id",
      id: payload.report_id as string,
    });
  }
  if (payload.session_id) {
    domainUpdates.push({
      table: "coaching_sessions",
      idField: "id",
      id: payload.session_id as string,
    });
  }
  const videoIcpPayload = videoIcpJobPayloadSchema.safeParse(payload);
  if (videoIcpPayload.success) {
    domainUpdates.push({
      table: "video_icp_reviews",
      idField: "id",
      id: videoIcpPayload.data.review_id,
      error: errorMessage ?? job.error,
    });
  }

  for (const { table, idField, id, error } of domainUpdates) {
    const update =
      error === undefined ? { status: "failed" } : { status: "failed", error };
    await svc
      .from(table)
      .update(update)
      .eq(idField, id)
      .eq("user_id", job.user_id);
  }
}
