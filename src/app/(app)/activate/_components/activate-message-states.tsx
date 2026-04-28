"use client";

import { Loader2, Play, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserType } from "@/lib/supabase/types";

interface ActivationEmptyStateProps {
  userType: UserType;
  isPending: boolean;
  onAdjustSettings: () => void;
  onDeeperSearch: () => void;
  onGoToDashboard: () => void;
}

export function ActivationEmptyState({
  userType,
  isPending,
  onAdjustSettings,
  onDeeperSearch,
  onGoToDashboard,
}: ActivationEmptyStateProps) {
  const emptyCopy =
    userType === "gtm"
      ? {
          title: "No accounts hiring a rubric role in the last 30 days",
          subtitle:
            "TheirStack didn't find firmographic matches actively posting jobs. Broaden the rubric or wait for the weekly dormant sweep to surface ICP-fit accounts that aren't hiring yet.",
          bullets: [
            "Broadening firmographics in Settings (industry, employee range, stage)",
            "Adding more hiring roles to the rubric signals",
            "Waiting for the weekly dormant sweep (runs Mondays at 12:00 UTC)",
          ],
        }
      : {
          title: "No matches in the last 10 days",
          subtitle:
            "We searched for your configured queries but didn't find matching roles posted recently.",
          bullets: [
            "Broadening your search queries in Settings",
            "Adding more locations",
            "Running a deeper search (checks the full month)",
          ],
        };

  return (
    <div className="mx-auto max-w-lg py-16 space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">{emptyCopy.title}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          {emptyCopy.subtitle}
        </p>
      </div>
      <Card className="gap-1.5 p-4">
        <p className="text-sm font-medium">Try:</p>
        <ul className="text-sm text-[var(--color-text-muted)] list-disc pl-5 space-y-1">
          {emptyCopy.bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onAdjustSettings}
          disabled={isPending}
        >
          <Settings size={14} />
          Adjust Settings
        </Button>
        <div className="flex items-center gap-2">
          {userType !== "gtm" && (
            <Button
              variant="outline"
              onClick={onDeeperSearch}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Run Deeper Search
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onGoToDashboard}
            disabled={isPending}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ActivationScoringFailedStateProps {
  discovered: number;
  errors: number;
  isPending: boolean;
  onRetry: () => void;
  onGoToDashboard: () => void;
}

// Distinct from the network/HTTP "error" phase: the activation request
// succeeded, candidates were discovered, but every per-row scoring call
// failed validation. Almost always transient (model output didn't match
// the closed schema). Retry is the right primary action.
export function ActivationScoringFailedState({
  discovered,
  errors,
  isPending,
  onRetry,
  onGoToDashboard,
}: ActivationScoringFailedStateProps) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center space-y-4">
      <h2 className="text-lg font-semibold">
        Scoring failed for all candidates
      </h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        We found {discovered} candidate{" "}
        {discovered === 1 ? "account" : "accounts"} but couldn&apos;t score any
        of them ({errors} {errors === 1 ? "error" : "errors"}). This is usually
        a transient model issue — try again.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button onClick={onRetry} disabled={isPending}>
          Try Again
        </Button>
        <Button variant="ghost" onClick={onGoToDashboard} disabled={isPending}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
