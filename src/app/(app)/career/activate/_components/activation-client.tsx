"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Spinner,
  ArrowSquareOut,
  Play,
  Envelope,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchProgress } from "@/components/ui/search-progress";
import { ResultCardSkeleton } from "@/components/ui/result-card-skeleton";
import { triggerPipelineAction } from "../../../actions";
import { dismissActivationAction } from "../actions";
import type {
  ActivationResult,
  ActivationSearchResult,
} from "@/lib/pipeline/activation";
import type {
  AccountActivationResult,
  AccountActivationSearchResult,
} from "@/lib/pipeline/activation-accounts";
import type { UserType } from "@/lib/supabase/types";
import { OpportunityCard } from "../../_components/opportunity-card";
import { AccountResultCard } from "./account-result-card";
import {
  ActivationEmptyState,
  ActivationScoringFailedState,
} from "./activate-message-states";

const REASSURANCE_MESSAGES = ["Searching job boards...", "Found some matches, scoring against your profile...", "Running full analysis on each role — this takes a minute or two...", "Still scoring — each role gets a detailed fit analysis...", "Almost done — comparing your best matches..."];
const REASSURANCE_INTERVALS = [0, 8_000, 25_000, 60_000, 90_000];
const LONG_RUNNING_BANNER_MS = 180_000;
const FETCH_TIMEOUT_MS = 240_000;

type Phase = "searching" | "results" | "empty" | "error" | "scoring-failed";

interface ActivationClientProps {
  gmailConnected: boolean;
  scoreThreshold: number;
  userType: UserType;
  activationSource?: "live" | "existing";
  activationLimit?: string | null;
}

export function ActivationClient({
  gmailConnected,
  scoreThreshold,
  userType,
  activationSource = "live",
  activationLimit = null,
}: ActivationClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("searching");
  const [data, setData] = useState<ActivationSearchResult | null>(null);
  const [results, setResults] = useState<ActivationResult[]>([]);
  const [accountData, setAccountData] =
    useState<AccountActivationSearchResult | null>(null);
  const [accountResults, setAccountResults] = useState<
    AccountActivationResult[]
  >([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [longRunning, setLongRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fetchedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== "searching") return;

    const reassurance = REASSURANCE_INTERVALS.slice(1).map((delay, i) =>
      setTimeout(() => setMessageIndex(i + 1), delay),
    );
    const longTimer = setTimeout(
      () => setLongRunning(true),
      LONG_RUNNING_BANNER_MS,
    );

    return () => {
      reassurance.forEach(clearTimeout);
      clearTimeout(longTimer);
    };
  }, [phase]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runSearch = useCallback(async () => {
    setPhase("searching");
    setMessageIndex(0);
    setLongRunning(false);
    setError(null);
    setData(null);
    setResults([]);
    setAccountData(null);
    setAccountResults([]);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const endpoint =
      userType === "gtm"
        ? buildAccountActivationEndpoint(activationSource, activationLimit)
        : "/api/activation/search";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error ??
            `Search failed (${res.status})`,
        );
      }

      if (userType === "gtm") {
        const result: AccountActivationSearchResult = await res.json();
        setAccountData(result);
        setAccountResults(result.results);
        if (result.results.length === 0 && result.stats.errors > 0) {
          setPhase("scoring-failed");
        } else {
          setPhase(result.results.length > 0 ? "results" : "empty");
        }
      } else {
        const result: ActivationSearchResult = await res.json();
        setData(result);
        setResults(result.results);
        setPhase(result.results.length > 0 ? "results" : "empty");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Activation timed out — try narrowing the rubric and retry.");
      } else {
        setError(
          err instanceof Error ? err.message : "Activation search failed",
        );
      }
      setPhase("error");
    } finally {
      clearTimeout(timeoutId);
    }
  }, [userType, activationSource, activationLimit]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    runSearch();
  }, [runSearch]);

  function handleDeeperSearch() {
    startTransition(async () => {
      const dismiss = await dismissActivationAction();
      if (!dismiss.ok) {
        toast.error(dismiss.error ?? "Failed to save activation state");
        return;
      }
      const result = await triggerPipelineAction();
      if (result.ok) {
        toast.success("Pipeline running", {
          description: "Refresh in a few minutes to see new results.",
        });
      } else {
        toast.error(result.error ?? "Pipeline failed");
      }
      router.push(userType === "gtm" ? "/gtm/icp" : "/career");
    });
  }

  function handleGoToDashboard() {
    startTransition(async () => {
      const dismiss = await dismissActivationAction();
      if (!dismiss.ok) {
        toast.error(dismiss.error ?? "Failed to save activation state");
        return;
      }
      router.push(userType === "gtm" ? "/gtm/accounts" : "/career");
    });
  }

  function handleAdjustSettings() {
    startTransition(async () => {
      const dismiss = await dismissActivationAction();
      if (!dismiss.ok) {
        toast.error(dismiss.error ?? "Failed to save activation state");
        return;
      }
      router.push("/settings");
    });
  }

  function handleRetry() {
    fetchedRef.current = true;
    runSearch();
  }

  if (phase === "searching") {
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
          total={REASSURANCE_MESSAGES.length}
          message={REASSURANCE_MESSAGES[messageIndex]}
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
              <Button variant="outline" onClick={handleCancel}>
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

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-lg py-16 text-center space-y-4">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={handleRetry} disabled={isPending}>
            Try Again
          </Button>
          <Button
            variant="ghost"
            onClick={handleGoToDashboard}
            disabled={isPending}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <ActivationEmptyState
        userType={userType}
        isPending={isPending}
        onAdjustSettings={handleAdjustSettings}
        onDeeperSearch={handleDeeperSearch}
        onGoToDashboard={handleGoToDashboard}
      />
    );
  }

  if (phase === "scoring-failed") {
    return (
      <ActivationScoringFailedState
        discovered={accountData?.stats.discovered ?? 0}
        errors={accountData?.stats.errors ?? 0}
        firstError={accountData?.stats.firstError ?? null}
        isPending={isPending}
        onRetry={handleRetry}
        onGoToDashboard={handleGoToDashboard}
      />
    );
  }

  const isGtm = userType === "gtm";
  const headerCounts = isGtm
    ? {
        discovered: accountData?.stats.discovered ?? 0,
        scored: accountData?.stats.scored ?? 0,
      }
    : {
        discovered: data?.stats.discovered ?? 0,
        scored: (data?.stats.scored ?? 0) + (data?.stats.filtered ?? 0),
      };
  const headerNoun = isGtm ? "accounts" : "roles";
  const headerFit = isGtm ? "best-fit accounts" : "best fits";

  return (
    <div className="mx-auto max-w-2xl py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Your top matches</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Found {headerCounts.discovered} {headerNoun}, scored{" "}
          {headerCounts.scored} — here are your {headerFit}.
        </p>
      </div>

      <div className="space-y-2">
        {isGtm
          ? accountResults.map((r) => (
              <AccountResultCard key={r.id} result={r} />
            ))
          : results.map((r) => (
              <OpportunityCard
                key={r.id}
                opportunity={r.opportunity}
                drafts={[]}
                scoreThreshold={scoreThreshold}
                analysisSummary={r.fitRationale}
                isCloseMatch={r.isCloseMatch}
                onAction={() =>
                  setResults((prev) => prev.filter((item) => item.id !== r.id))
                }
              />
            ))}
      </div>

      {!gmailConnected && (
        <Card className="gap-3 p-5">
          <div className="flex items-center gap-2">
            <Envelope size={16} />
            <h3 className="text-sm font-semibold">Gmail Integration</h3>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Connect your Gmail account to send approved outreach emails directly
            from the pipeline. You can also do this later from Settings.
          </p>
          <div className="flex items-center gap-3">
            <a
              href={`/api/auth/gmail?return_to=${encodeURIComponent("/")}`}
              className={buttonVariants()}
            >
              <ArrowSquareOut size={13} />
              Connect Gmail
            </a>
          </div>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Gmail is optional. The pipeline can discover, score, and draft
            emails without it.
          </p>
        </Card>
      )}

      <div className="flex items-center justify-between">
        {!isGtm && (
          <Button
            variant="outline"
            onClick={handleDeeperSearch}
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
        <Button onClick={handleGoToDashboard} disabled={isPending}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

function buildAccountActivationEndpoint(
  source: "live" | "existing",
  limit: string | null,
): string {
  const params = new URLSearchParams();
  if (source === "existing") params.set("source", "existing");
  if (source === "existing" && limit) params.set("limit", limit);
  const query = params.toString();
  return `/api/activation/accounts${query ? `?${query}` : ""}`;
}
