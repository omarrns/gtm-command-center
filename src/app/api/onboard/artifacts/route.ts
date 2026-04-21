import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  ingestFile,
  ingestText,
  ingestUrl,
  type IngestOptions,
} from "@/lib/onboarding/artifacts/ingest";
import { getTemplate } from "@/lib/onboarding/templates";
import { analyzeArtifacts } from "@/lib/onboarding/orchestrator/run";
import type { OnboardingArtifactRow } from "@/lib/supabase/types";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

export const maxDuration = 120;

interface ArtifactRequestBody {
  interviewId?: string | null;
  kind: string;
  url?: string;
  text?: string;
  sourceLabel?: string;
}

export async function POST(req: Request) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
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
    const orchestratorState = await maybeAnalyze(svc, interviewId, row);
    return Response.json({ artifact: row, orchestratorState });
  }

  const body = (await req.json()) as ArtifactRequestBody;
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
    const orchestratorState = await maybeAnalyze(svc, opts.interviewId, row);
    return Response.json({ artifact: row, orchestratorState });
  }

  if (body.text) {
    const row = await ingestText(body.text, opts, svc);
    const orchestratorState = await maybeAnalyze(svc, opts.interviewId, row);
    return Response.json({ artifact: row, orchestratorState });
  }

  return Response.json(
    { error: "Provide one of: url, text, or a multipart file." },
    { status: 400 },
  );
}

/**
 * After a successful artifact landing, trigger orchestrator re-analysis for
 * the interview's template (if it's agentic). Failed artifacts don't advance
 * the orchestrator — the status panel will show the failure to the user.
 */
async function maybeAnalyze(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  interviewId: string | null,
  artifact: OnboardingArtifactRow,
): Promise<OrchestratorState | null> {
  if (!interviewId) return null;
  if (artifact.status !== "succeeded") return null;

  const { data: interview } = await svc
    .from("onboarding_interviews")
    .select("template_id, is_refresh")
    .eq("id", interviewId)
    .single();

  if (!interview) return null;

  const template = getTemplate(interview.template_id);
  if (!template.agenticMode) return null;

  return analyzeArtifacts(interviewId, svc, template, {
    isRefresh: interview.is_refresh,
  });
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
