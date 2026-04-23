/**
 * Scoring Profile Normalization — dispatcher
 *
 * As of SPEC-3 Phase 1.d, the normalizer body lives on each template
 * (template.normalizeScoringProfile). This top-level function remains the
 * call-site entry point — it resolves the template from the passed
 * templateId (or the single-template default) and delegates.
 *
 * job_search's normalizer (moved to templates/job-search.ts) reads the
 * existing memory_documents + pipeline_config layout and populates the
 * legacy user_scoring_profiles columns. ICP's normalizer (Phase 3) will
 * populate the icp_rubric JSONB column instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";

export async function normalizeScoringProfile(
  svc: SupabaseClient,
  userId: string,
  templateId: InterviewTemplateId = "job_search",
  context?: { interviewId?: string },
): Promise<void> {
  const template = getTemplate(templateId);
  if (!template.normalizeScoringProfile) return;
  await template.normalizeScoringProfile(svc, userId, context);
}
