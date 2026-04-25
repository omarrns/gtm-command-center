"use client";

import { useState } from "react";
import { HandoffCard } from "@/components/ui/handoff-card";
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
  const extracted = (interview.extracted ?? {}) as Record<string, unknown>;

  // The persisted insights from a prior stream completion. Null means the
  // user has either just landed in story_review for the first time, or a
  // prior stream failed before onFinish persisted.
  const persistedInsights =
    (extracted.insights as ExtractionInsights | undefined) ?? null;

  // If insights already exist, skip handoff entirely. Otherwise the handoff
  // screen requires an explicit click to start the stream.
  const [phase, setPhase] = useState<"handoff" | "reading">(
    persistedInsights ? "reading" : "handoff",
  );

  // Reconstruct the JobSearchEdits payload from the unified `extracted`
  // column that startStoryPhase populated. This is what gets handed to
  // confirmInterviewAction at the end.
  const reviewEdits: JobSearchEdits = {
    profile: (extracted.profile ?? {}) as ExtractionProfile,
    search: (extracted.search ?? {}) as ExtractionSearch,
    outreach: (extracted.outreach ?? {}) as ExtractionOutreach,
  };

  if (phase === "handoff") {
    return (
      <HandoffCard
        title="I've got enough to work with."
        description="I took notes on everything. Want to read what I wrote about you?"
        ctaLabel="Read my story"
        ctaSubtext="Takes about thirty seconds."
        onCta={() => setPhase("reading")}
      />
    );
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
