"use client";

import Link from "next/link";
import { useState, useTransition, useEffect, useRef } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { InterviewClient } from "./interview-client";
import { ReviewClient } from "./review-client";
import { OnboardClient } from "./onboard-client";
import { StoryClient } from "./story-client";
import {
  getOrCreateInterviewAction,
  extractAndReviewAction,
} from "../interview-actions";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type {
  ClientInterviewTemplate,
  InterviewTemplateId,
} from "@/lib/onboarding/templates/types";

interface OnboardRouterProps {
  interview: OnboardingInterviewRow | null;
  clientTemplate: ClientInterviewTemplate;
  // SPEC-3 Phase 4.b: resolved template from URL / user_type / picker.
  // Passed explicitly so the client doesn't re-resolve from props.
  templateId: InterviewTemplateId;
  isRefresh: boolean;
  gmailConnected: boolean;
  // Props forwarded to OnboardClient (manual mode)
  completedSteps: number[];
  initialStep: number | null;
  existingProfile: string | null;
  existingPositioning: string | null;
  existingConfig: {
    scoreThreshold: number;
    dailySendCap: number;
    searchQueries: string[];
    searchLocations: string[];
  } | null;
  existingDealbreakers: string | null;
  existingOutreach: string | null;
}

// Short, user-facing labels for each persona. Surfaced on the choice
// screen + anywhere the active template should be visible.
const TEMPLATE_LABEL: Record<InterviewTemplateId, string> = {
  job_search: "Job search",
  icp_definition: "Company ICP",
};

type Mode = "choice" | "interview" | "manual";

export function OnboardRouter({
  interview: initialInterview,
  clientTemplate,
  templateId,
  isRefresh,
  gmailConnected,
  completedSteps,
  initialStep,
  existingProfile,
  existingPositioning,
  existingConfig,
  existingDealbreakers,
  existingOutreach,
}: OnboardRouterProps) {
  const [interview, setInterview] = useState<OnboardingInterviewRow | null>(
    initialInterview,
  );
  const [mode, setMode] = useState<Mode>(() => {
    if (initialInterview) {
      // Resume existing interview
      return "interview";
    }
    return "choice";
  });
  const [isPending, startTransition] = useTransition();
  const autoExtractTriggered = useRef(false);

  // Auto-trigger extraction on resume when ready_for_extraction is set
  // but status is still in_progress (server set the flag, client disconnected)
  const needsAutoExtract =
    interview?.status === "in_progress" && interview.ready_for_extraction;

  useEffect(() => {
    if (!needsAutoExtract || autoExtractTriggered.current || !interview) return;
    autoExtractTriggered.current = true;
    startTransition(async () => {
      const result = await extractAndReviewAction(interview.id);
      if (result.ok) {
        setInterview(result.interview);
      } else {
        toast.error(result.error ?? "Extraction failed — try again");
        autoExtractTriggered.current = false;
      }
    });
  }, [needsAutoExtract, interview]);

  // Show spinner while extracting or auto-extracting
  if (interview && (interview.status === "extracting" || needsAutoExtract)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={24} className="animate-spin text-[var(--color-blue)]" />
        <p className="text-sm text-[var(--color-text-muted)]">
          Preparing your profile summary...
        </p>
      </div>
    );
  }

  // ── Story phase (agentic-only intermediate between review and confirmed) ──
  if (interview && interview.status === "story_review") {
    return <StoryClient interview={interview} isRefresh={isRefresh} />;
  }

  // ── Review mode ──
  if (interview && interview.status === "review") {
    return (
      <ReviewClient
        interview={interview}
        clientTemplate={clientTemplate}
        isRefresh={isRefresh}
        existingData={{
          config: existingConfig,
          dealbreakers: existingDealbreakers,
          outreach: existingOutreach,
        }}
        onBackToInterview={(updated) => {
          setInterview(updated);
        }}
        onContinueToStory={(updated) => {
          setInterview(updated);
        }}
      />
    );
  }

  // ── Interview mode ──
  if (mode === "interview" && interview) {
    return (
      <InterviewClient
        interview={interview}
        clientTemplate={clientTemplate}
        onExtracted={(updated) => {
          setInterview(updated);
        }}
        onSwitchToManual={() => setMode("manual")}
      />
    );
  }

  // ── Manual mode ──
  if (mode === "manual") {
    return (
      <OnboardClient
        completedSteps={completedSteps}
        initialStep={initialStep}
        isRefresh={isRefresh}
        existingProfile={existingProfile}
        existingPositioning={existingPositioning}
        existingConfig={existingConfig}
        existingDealbreakers={existingDealbreakers}
        existingOutreach={existingOutreach}
        gmailConnected={gmailConnected}
      />
    );
  }

  // ── Choice screen ──
  function startInterview() {
    if (isPending || interview) return;
    startTransition(async () => {
      // Thread templateId through so the right persona's interview row is
      // created. Without this, the action defaults to 'job_search' and
      // ICP users would get a job_search interview under the covers.
      const result = await getOrCreateInterviewAction(isRefresh, templateId);
      if (result.ok) {
        setInterview(result.interview);
        setMode("interview");
      } else {
        toast.error(result.error ?? "Failed to start interview — try again");
      }
    });
  }

  const personaLabel = TEMPLATE_LABEL[templateId];
  const personaDescription =
    templateId === "icp_definition"
      ? "We'll build your ICP rubric from exemplar customers, buyer personas, and your product context."
      : "We need to understand who you are to find and score opportunities for you.";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/onboard"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft size={12} />
          Switch persona
        </Link>
        <span className="rounded-full border border-[var(--color-border-strong)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {personaLabel}
        </span>
      </div>

      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight">
          {isRefresh ? "Profile Refresh" : "Set up your pipeline"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {isRefresh
            ? "Update your profile so the pipeline uses your latest context."
            : personaDescription}
        </p>
      </div>

      <button
        type="button"
        onClick={startInterview}
        disabled={isPending}
        className="surface p-5 text-left hover:border-[var(--color-blue)] transition-colors max-w-sm"
      >
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Chat with AI coach</h2>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Answer a few questions conversationally. Takes ~5 minutes and produces
          richer data for scoring and outreach.
        </p>
        {isPending && (
          <div className="mt-3">
            <Loader2
              size={14}
              className="animate-spin text-[var(--color-blue)]"
            />
          </div>
        )}
      </button>
    </div>
  );
}
