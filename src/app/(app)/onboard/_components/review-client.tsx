"use client";

import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { ClientInterviewTemplate } from "@/lib/onboarding/templates/types";
import { ReviewJobSearch } from "./review-sections/review-job-search";
import { ReviewIcp } from "./review-sections/review-icp";

interface ExistingData {
  config: {
    scoreThreshold: number;
    dailySendCap: number;
    searchQueries: string[];
    searchLocations: string[];
  } | null;
  dealbreakers: string | null;
  outreach: string | null;
}

interface ReviewClientProps {
  interview: OnboardingInterviewRow;
  clientTemplate: ClientInterviewTemplate;
  isRefresh: boolean;
  onBackToInterview: (interview: OnboardingInterviewRow) => void;
  existingData?: ExistingData;
}

/**
 * Thin dispatcher — each template owns its own review UI because the shape
 * of what's being reviewed differs per template. job_search confirms facts
 * about one entity (the user); icp_definition synthesizes across N
 * heterogeneous exemplars and surfaces disagreements. They share nothing
 * structurally, so this is a switch, not a parameterization.
 */
export function ReviewClient({
  interview,
  clientTemplate,
  isRefresh,
  onBackToInterview,
  existingData,
}: ReviewClientProps) {
  if (clientTemplate.id === "icp_definition") {
    return <ReviewIcp />;
  }

  return (
    <ReviewJobSearch
      interview={interview}
      clientTemplate={clientTemplate}
      isRefresh={isRefresh}
      onBackToInterview={onBackToInterview}
      existingData={existingData}
    />
  );
}
