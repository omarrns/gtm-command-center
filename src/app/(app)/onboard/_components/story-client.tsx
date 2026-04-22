"use client";

import { useState } from "react";
import { StoryHandoff } from "./story-handoff";
import { StoryReader } from "./story-reader";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type {
  ExtractionProfile,
  ExtractionSearch,
  ExtractionOutreach,
  JobSearchEdits,
} from "@/lib/onboarding/templates/job-search";
import type { ExtractionInsights } from "@/lib/onboarding/insights-schema";

interface StoryClientProps {
  interview: OnboardingInterviewRow;
  isRefresh: boolean;
}

export function StoryClient({ interview, isRefresh }: StoryClientProps) {
  // The persisted insights from a prior stream completion. Null means the
  // user has either just landed in story_review for the first time, or a
  // prior stream failed before onFinish persisted.
  const persistedInsights =
    interview.extracted_insights as ExtractionInsights | null;

  // If insights already exist, skip handoff entirely. Otherwise the handoff
  // screen requires an explicit click to start the stream.
  const [phase, setPhase] = useState<"handoff" | "reading">(
    persistedInsights ? "reading" : "handoff",
  );

  // Reconstruct the JobSearchEdits payload from the columns startStoryPhase
  // wrote. This is what gets handed to confirmInterviewAction at the end.
  const reviewEdits: JobSearchEdits = {
    profile: (interview.extracted_profile ?? {}) as ExtractionProfile,
    search: (interview.extracted_search ?? {}) as ExtractionSearch,
    outreach: (interview.extracted_outreach ?? {}) as ExtractionOutreach,
  };

  if (phase === "handoff") {
    return <StoryHandoff onStart={() => setPhase("reading")} />;
  }

  return (
    <StoryReader
      interviewId={interview.id}
      reviewEdits={reviewEdits}
      isRefresh={isRefresh}
      initialInsights={persistedInsights}
    />
  );
}
