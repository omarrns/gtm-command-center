"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { MessageSquare, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { InterviewClient } from "./interview-client";
import { ReviewClient } from "./review-client";
import { OnboardClient } from "./onboard-client";
import {
  getOrCreateInterviewAction,
  extractAndReviewAction,
} from "../interview-actions";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

interface OnboardRouterProps {
  interview: OnboardingInterviewRow | null;
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

  // ── Review mode ──
  if (interview && interview.status === "review") {
    return (
      <ReviewClient
        interview={interview}
        isRefresh={isRefresh}
        existingData={{
          config: existingConfig,
          dealbreakers: existingDealbreakers,
          outreach: existingOutreach,
        }}
        onBackToInterview={(updated) => {
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
      const result = await getOrCreateInterviewAction(isRefresh);
      if (result.ok) {
        setInterview(result.interview);
        setMode("interview");
      } else {
        toast.error(result.error ?? "Failed to start interview — try again");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight">
          {isRefresh ? "Profile Refresh" : "Set up your pipeline"}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {isRefresh
            ? "Update your profile so the pipeline uses your latest context."
            : "We need to understand who you are to find and score opportunities for you."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Interview option */}
        <button
          type="button"
          onClick={startInterview}
          disabled={isPending}
          className="surface p-5 text-left hover:border-[var(--color-blue)] transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-[var(--color-blue-muted)] flex items-center justify-center">
              <MessageSquare size={16} className="text-[var(--color-blue)]" />
            </div>
            <h2 className="text-sm font-semibold">Chat with AI coach</h2>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Answer a few questions conversationally. Takes ~5 minutes and
            produces richer data for scoring and outreach.
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

        {/* Manual option */}
        <button
          type="button"
          onClick={() => setMode("manual")}
          disabled={isPending}
          className="surface p-5 text-left hover:border-[var(--color-blue)] transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
              <ClipboardList
                size={16}
                className="text-[var(--color-text-muted)]"
              />
            </div>
            <h2 className="text-sm font-semibold">Fill in manually</h2>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Enter your profile, search preferences, and outreach style in a
            form. Takes ~3 minutes.
          </p>
        </button>
      </div>
    </div>
  );
}
