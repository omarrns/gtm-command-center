"use client";
import {
  Spinner,
  Play,
  Gear,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchProgress } from "@/components/ui/search-progress";
import { ResultCardSkeleton } from "@/components/ui/result-card-skeleton";
import type { UserType } from "@/lib/supabase/types";

interface ActivationSearchingStateProps {
  userType: UserType;
  message: string;
  totalMessages: number;
  messageIndex: number;
  longRunning: boolean;
  onCancel: () => void;
}

export function ActivationSearchingState({
  userType,
  message,
  totalMessages,
  messageIndex,
  longRunning,
  onCancel,
}: ActivationSearchingStateProps) {
  const searchingNoun = userType === "gtm" ? "accounts" : "roles";

  return (
    <div className="mx-auto max-w-2xl py-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          Finding your top {searchingNoun}…
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          This usually takes about a minute.
        </p>
      </div>

      <SearchProgress
        step={messageIndex}
        total={totalMessages}
        message={message}
        className="py-2"
      />

      {longRunning ? (
        <Card className="gap-3 p-4">
          <p className="text-sm font-medium">
            This is taking longer than usual.
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            The scoring sweep runs each candidate sequentially against your
            rubric. If you&apos;d rather not wait, cancel and retry — or come
            back in a minute.
          </p>
          <div>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <ResultCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

interface ActivationRetryStateProps {
  isPending: boolean;
  onRetry: () => void;
  onGoToDashboard: () => void;
}

interface ActivationErrorStateProps extends ActivationRetryStateProps {
  error: string | null;
}

export function ActivationErrorState({
  error,
  isPending,
  onRetry,
  onGoToDashboard,
}: ActivationErrorStateProps) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center space-y-4">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
      <ActivationRetryActions
        isPending={isPending}
        onRetry={onRetry}
        onGoToDashboard={onGoToDashboard}
      />
    </div>
  );
}

export function ActivationInProgressState({
  isPending,
  onRetry,
  onGoToDashboard,
}: ActivationRetryStateProps) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center space-y-4">
      <h2 className="text-lg font-semibold">Activation is already running</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        Another tab or retry is already scoring your preview. Check that tab,
        retry in a minute, or go to your dashboard.
      </p>
      <ActivationRetryActions
        isPending={isPending}
        onRetry={onRetry}
        onGoToDashboard={onGoToDashboard}
      />
    </div>
  );
}

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
          <Gear size={14} />
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
                <Spinner size={14} className="animate-spin" />
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

interface ActivationScoringFailedStateProps extends ActivationRetryStateProps {
  discovered: number;
  errors: number;
  // Pre-cleaned by `mapAiError` upstream — never the raw SDK error string.
  firstError: string | null;
}

// Distinct from the network/HTTP "error" phase: the activation request
// succeeded, candidates were discovered, but every per-row scoring call
// failed validation. Almost always transient (model output didn't match
// the closed schema). Retry is the right primary action.
export function ActivationScoringFailedState({
  discovered,
  errors,
  firstError,
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
      {firstError ? (
        <p className="text-xs text-[var(--color-text-subtle)] font-mono">
          {firstError}
        </p>
      ) : null}
      <ActivationRetryActions
        isPending={isPending}
        onRetry={onRetry}
        onGoToDashboard={onGoToDashboard}
      />
    </div>
  );
}

function ActivationRetryActions({
  isPending,
  onRetry,
  onGoToDashboard,
}: ActivationRetryStateProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Button onClick={onRetry} disabled={isPending}>
        Try Again
      </Button>
      <Button variant="ghost" onClick={onGoToDashboard} disabled={isPending}>
        Go to Dashboard
      </Button>
    </div>
  );
}
