import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";

export interface OnboardingStatus {
  complete: boolean;
  completedSteps: number[];
}

// Maps a user_type to the template whose completionCheck decides whether
// that persona is "done onboarding."
export const USER_TYPE_TO_TEMPLATE: Record<string, InterviewTemplateId> = {
  job_seeker: "job_search",
  gtm: "icp_definition",
};

/**
 * Check whether the user has completed the onboarding outputs required for
 * their persona. Delegates to the active template's completionCheck — the
 * template owns what "complete" means for its shape.
 *
 * For v1 (job_search-only), the check is the three legacy memory/config
 * rows. Phase 3's ICP template provides its own check (company_icp memory
 * doc + icp_rubric + pipeline_config).
 */
export async function isOnboardingComplete(
  svc: SupabaseClient,
  userId: string,
  userType: "job_seeker" | "gtm" = "job_seeker",
): Promise<OnboardingStatus> {
  const templateId = USER_TYPE_TO_TEMPLATE[userType] ?? "job_search";
  const template = getTemplate(templateId);
  return template.completionCheck(svc, userId);
}
