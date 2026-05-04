import { nanoid } from "nanoid";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { asJson } from "@/lib/supabase/schema";
import {
  ingestFile,
  ingestText,
  ingestUrl,
  ingestUrls,
  type IngestOptions,
} from "@/lib/onboarding/artifacts/ingest";
import { getTemplate } from "@/lib/onboarding/templates";
import {
  computeNextKey,
  loadArtifactsForInterview,
} from "@/lib/onboarding/orchestrator/run-helpers";
import { markOrchestratorAnalysisFailed } from "@/lib/onboarding/orchestrator/run";
import {
  emptyOrchestratorState,
  type OrchestratorState,
} from "@/lib/onboarding/orchestrator/types";
import { enqueueOnboardingArtifactAnalysisJob } from "@/lib/jobs/onboarding-artifact-analysis";
import { parseArtifactRequest } from "../_lib/request-validation";

export const maxDuration = 120;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const user = await requireUser();
    const svc = createSupabaseServiceClient();
    const form = await req.formData();
    const file = form.get("file");
    const interviewId = (form.get("interviewId") as string | null) ?? null;
    const kind = (
      (form.get("kind") as string | null) ?? "uploaded_file"
    ).trim();
    const sourceLabel = (form.get("sourceLabel") as string | null) ?? undefined;

    if (!(file instanceof File)) {
      return Response.json(
        { error: "No file provided in multipart body." },
        { status: 400 },
      );
    }

    const ownershipErr = await checkInterviewOwnership(
      svc,
      interviewId,
      user.id,
    );
    if (ownershipErr) return ownershipErr;

    const opts: IngestOptions = {
      userId: user.id,
      interviewId,
      kind,
      sourceLabel,
    };
    const buffer = await file.arrayBuffer();
    const row = await ingestFile(buffer, file.name, file.type, opts, svc);
    const orchestratorState = await maybeQueueAnalysis(
      svc,
      interviewId,
      user.id,
    );
    return Response.json({ artifact: row, orchestratorState });
  }

  const parsed = await parseArtifactRequest(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  // Batch URL path: scrape N URLs in parallel, persist all, then queue one
  // async artifact-analysis job so the HTTP request doesn't wait on Opus.
  if (Array.isArray(body.urls) && body.urls.length > 0) {
    if (body.urls.some((u) => !u?.url || !u?.kind)) {
      return Response.json(
        { error: "Each url entry requires both `url` and `kind`." },
        { status: 400 },
      );
    }

    const ownershipErr = await checkInterviewOwnership(
      svc,
      body.interviewId ?? null,
      user.id,
    );
    if (ownershipErr) return ownershipErr;

    const rows = await ingestUrls(
      body.urls,
      {
        userId: user.id,
        interviewId: body.interviewId ?? null,
        sourceLabel: body.sourceLabel,
      },
      svc,
    );
    const orchestratorState = await maybeQueueAnalysis(
      svc,
      body.interviewId ?? null,
      user.id,
    );
    return Response.json({ artifacts: rows, orchestratorState });
  }

  if (!body.kind) {
    return Response.json({ error: "`kind` is required." }, { status: 400 });
  }

  const ownershipErr = await checkInterviewOwnership(
    svc,
    body.interviewId ?? null,
    user.id,
  );
  if (ownershipErr) return ownershipErr;

  const opts: IngestOptions = {
    userId: user.id,
    interviewId: body.interviewId ?? null,
    kind: body.kind,
    sourceLabel: body.sourceLabel,
  };

  if (body.url) {
    const row = await ingestUrl(body.url, opts, svc);
    const orchestratorState = await maybeQueueAnalysis(
      svc,
      opts.interviewId,
      user.id,
    );
    return Response.json({ artifact: row, orchestratorState });
  }

  if (body.text) {
    const row = await ingestText(body.text, opts, svc);
    const orchestratorState = await maybeQueueAnalysis(
      svc,
      opts.interviewId,
      user.id,
    );
    return Response.json({ artifact: row, orchestratorState });
  }

  return Response.json(
    { error: "Provide one of: url, text, urls, or a multipart file." },
    { status: 400 },
  );
}

/**
 * After any artifact lands (succeeded OR failed), sync orchestrator_state.
 * Succeeded artifacts queue the expensive Opus analysis in the worker so this
 * route returns after scrape/persist. Failed-only batches still need a saved
 * manifest so the UI can surface why nothing was read.
 */
async function maybeQueueAnalysis(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  interviewId: string | null,
  userId: string,
): Promise<OrchestratorState | null> {
  if (!interviewId) return null;

  const { data: interview } = await svc
    .from("onboarding_interviews")
    .select("template_id, is_refresh, orchestrator_state")
    .eq("id", interviewId)
    .eq("user_id", userId)
    .single();

  if (!interview) return null;

  const template = getTemplate(interview.template_id);
  if (!template.agenticMode) return null;

  const allArtifacts = await loadArtifactsForInterview(svc, interviewId);
  const succeeded = allArtifacts.filter((a) => a.status === "succeeded");
  const failed = allArtifacts.filter((a) => a.status === "failed");
  const prior =
    (interview.orchestrator_state as OrchestratorState | null) ??
    emptyOrchestratorState(template.id);
  const analysisRunId =
    succeeded.length > 0 ? `artifact-analysis-${nanoid()}` : undefined;
  const metrics = {
    ...prior.metrics,
    artifactSuccessCount: succeeded.length,
    artifactFailureCount: failed.length,
    currentAnalysisRunId: analysisRunId,
  };
  if (!analysisRunId) {
    delete metrics.currentAnalysisRunId;
  }

  const next: OrchestratorState = {
    ...prior,
    templateId: template.id,
    status: succeeded.length > 0 ? "analyzing" : "interviewing",
    artifacts: allArtifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      sourceType: a.source_type,
      sourceLabel: a.source_label ?? undefined,
      sourceUrl: a.source_url ?? undefined,
      fileName: a.file_name ?? undefined,
      status: a.status,
      errorMessage: a.error_message ?? undefined,
    })),
    metrics,
  };
  if (succeeded.length === 0) {
    next.nextDimensionKey = computeNextKey(next, template);
  }

  const { error } = await svc
    .from("onboarding_interviews")
    .update({
      orchestrator_state: asJson(next),
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to sync artifact state: ${error.message}`);
  }

  if (analysisRunId) {
    try {
      await enqueueOnboardingArtifactAnalysisJob(svc, {
        userId,
        payload: {
          interviewId,
          templateId: template.id,
          isRefresh: interview.is_refresh,
          analysisRunId,
        },
      });
    } catch (err) {
      await markOrchestratorAnalysisFailed(svc, interviewId, analysisRunId);
      throw err;
    }
  }

  return next;
}

async function checkInterviewOwnership(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  interviewId: string | null,
  userId: string,
): Promise<Response | null> {
  if (!interviewId) return null;
  const { data, error } = await svc
    .from("onboarding_interviews")
    .select("user_id")
    .eq("id", interviewId)
    .single();
  if (error || !data || data.user_id !== userId) {
    return new Response("Interview not found", { status: 404 });
  }
  return null;
}
