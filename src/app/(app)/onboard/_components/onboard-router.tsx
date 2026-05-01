"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  Spinner,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { InterviewClient } from "./interview-client";
import { ReviewClient } from "./review-client";
import { OnboardClient } from "./onboard-client";
import { StoryClient } from "./story-client";
import { IcpNarrativeClient } from "./icp-narrative-client";
import { getOrCreateInterviewAction } from "../interview-actions";
import { extractAndReviewAction } from "../extraction-actions";
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
  const autoStartTriggered = useRef(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Auto-start: skip the redundant one-CTA interstitial and enter the
  // interview immediately. Manual mode is still reachable from inside
  // InterviewClient via onSwitchToManual, so we don't lose an affordance.
  useEffect(() => {
    if (
      mode !== "choice" ||
      interview ||
      isPending ||
      autoStartTriggered.current
    ) {
      return;
    }
    autoStartTriggered.current = true;
    startTransition(async () => {
      const result = await getOrCreateInterviewAction(isRefresh, templateId);
      if (result.ok) {
        setInterview(result.interview);
        setMode("interview");
      } else {
        setStartError(result.error ?? "Failed to start interview");
        autoStartTriggered.current = false;
      }
    });
  }, [mode, interview, isPending, isRefresh, templateId]);

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
        <Spinner size={24} className="animate-spin text-[var(--color-blue)]" />
        <p className="text-sm text-[var(--color-text-muted)]">
          Preparing your profile summary...
        </p>
      </div>
    );
  }

  // ── Story phase (agentic-only intermediate between review and confirmed) ──
  if (interview && interview.status === "story_review") {
    if (interview.template_id === "icp_definition") {
      return <IcpNarrativeClient interview={interview} isRefresh={isRefresh} />;
    }
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

  // ── Auto-start loading / error fallback ──
  if (startError) {
    return (
      <div className="mx-auto flex min-h-[75vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">{startError}</p>
        <button
          type="button"
          onClick={() => {
            autoStartTriggered.current = false;
            setStartError(null);
          }}
          className="text-sm font-medium text-[var(--color-blue)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[75vh] flex-col items-center justify-center gap-3 p-6">
      <Spinner size={20} className="animate-spin text-[var(--color-blue)]" />
    </div>
  );
}
