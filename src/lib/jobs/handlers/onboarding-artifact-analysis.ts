import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/supabase/types";
import { getTemplate } from "@/lib/onboarding/templates";
import {
  analyzeArtifacts,
  markOrchestratorAnalysisFailed,
  StaleOrchestratorAnalysisError,
} from "@/lib/onboarding/orchestrator/run";
import type { OnboardingArtifactAnalysisPayload } from "@/lib/jobs/onboarding-artifact-analysis";

export async function runOnboardingArtifactAnalysisJob(
  job: JobRow,
  svc: SupabaseClient,
) {
  const payload = parsePayload(job.payload);

  try {
    const { data: interview, error } = await svc
      .from("onboarding_interviews")
      .select("user_id, template_id, is_refresh")
      .eq("id", payload.interviewId)
      .eq("user_id", job.user_id)
      .single();

    if (error || !interview) {
      throw new Error(
        `Interview not found for artifact analysis: ${payload.interviewId}`,
      );
    }
    if (interview.template_id !== payload.templateId) {
      throw new Error(
        `Artifact analysis template mismatch: payload=${payload.templateId} row=${interview.template_id}`,
      );
    }

    const template = getTemplate(interview.template_id);
    if (!template.agenticMode) {
      throw new Error(
        `Template does not support artifact analysis: ${interview.template_id}`,
      );
    }

    await analyzeArtifacts(payload.interviewId, svc, template, {
      isRefresh: interview.is_refresh ?? payload.isRefresh,
      analysisRunId: payload.analysisRunId,
    });

    return {
      interviewId: payload.interviewId,
      analysisRunId: payload.analysisRunId,
    };
  } catch (err) {
    if (err instanceof StaleOrchestratorAnalysisError) {
      return {
        interviewId: payload.interviewId,
        analysisRunId: payload.analysisRunId,
        stale: true,
      };
    }

    await markOrchestratorAnalysisFailed(
      svc,
      payload.interviewId,
      payload.analysisRunId,
    );
    throw err;
  }
}

function parsePayload(payload: Record<string, unknown>) {
  const parsed = payload as Partial<OnboardingArtifactAnalysisPayload>;
  if (
    !parsed.interviewId ||
    !parsed.templateId ||
    typeof parsed.isRefresh !== "boolean" ||
    !parsed.analysisRunId
  ) {
    throw new Error("Invalid onboarding-artifact-analysis payload.");
  }
  return parsed as OnboardingArtifactAnalysisPayload;
}
