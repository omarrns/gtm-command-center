"use client";

import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { ClientInterviewTemplate } from "@/lib/onboarding/templates/types";
import { ReviewJobSearch } from "./review-sections/review-job-search";
import { ReviewIcp } from "./review-sections/review-icp";
import { SwitchPersonaControl } from "./switch-persona-control";

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
  onContinueToStory: (interview: OnboardingInterviewRow) => void;
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
  onContinueToStory,
  existingData,
}: ReviewClientProps) {
  // SPEC-3 audit Phase 4.d: switch control must be reachable from every
  // onboarding screen, not only the interview flow. Rendered as a thin
  // header above whichever template-specific review UI dispatches below.
  const header = (
    <div className="mx-auto flex max-w-xl items-center justify-end px-6 pt-4">
      <SwitchPersonaControl
        interviewId={interview.id}
        currentTemplateId={clientTemplate.id}
      />
    </div>
  );

  if (clientTemplate.id === "icp_definition") {
    return (
      <>
        {header}
        <ReviewIcp
          interview={interview}
          clientTemplate={clientTemplate}
          isRefresh={isRefresh}
          onBackToInterview={onBackToInterview}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <ReviewJobSearch
        interview={interview}
        clientTemplate={clientTemplate}
        isRefresh={isRefresh}
        onBackToInterview={onBackToInterview}
        onContinueToStory={onContinueToStory}
        existingData={existingData}
      />
    </>
  );
}
