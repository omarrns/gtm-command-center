"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink, Play, Settings, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchProgress } from "@/components/ui/search-progress";
import { ResultCardSkeleton } from "@/components/ui/result-card-skeleton";
import { triggerPipelineAction } from "../../actions";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REASSURANCE_MESSAGES = [
  "Searching job boards...",
  "Found some matches, scoring against your profile...",
  "Running full analysis on each role — this takes a minute or two...",
  "Still scoring — each role gets a detailed fit analysis...",
  "Almost done — comparing your best matches...",
];

const REASSURANCE_INTERVALS = [0, 8_000, 25_000, 60_000, 90_000];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = "searching" | "results" | "empty" | "error";

interface ActivationClientProps {
  gmailConnected: boolean;
  scoreThreshold: number;
  userType: UserType;
}

export function ActivationClient({
  gmailConnected,
  scoreThreshold,
  userType,
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fetchedRef = useRef(false);

  // Timed reassurance messages
  useEffect(() => {
    if (phase !== "searching") return;

    const timers = REASSURANCE_INTERVALS.slice(1).map((delay, i) =>
      setTimeout(() => setMessageIndex(i + 1), delay),
    );

    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const runSearch = useCallback(async () => {
    setPhase("searching");
    setMessageIndex(0);
    setError(null);
    setData(null);
    setResults([]);
    setAccountData(null);
    setAccountResults([]);

    const endpoint =
      userType === "gtm"
        ? "/api/activation/accounts"
        : "/api/activation/search";
    try {
      const res = await fetch(endpoint, { method: "POST" });
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
        setPhase(result.results.length > 0 ? "results" : "empty");
      } else {
        const result: ActivationSearchResult = await res.json();
        setData(result);
        setResults(result.results);
        setPhase(result.results.length > 0 ? "results" : "empty");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation search failed");
      setPhase("error");
    }
  }, [userType]);

  // Fire activation search on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    runSearch();
  }, [runSearch]);

  // ── Actions ──

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
      router.push("/");
    });
  }

  function handleGoToDashboard() {
    startTransition(async () => {
      const dismiss = await dismissActivationAction();
      if (!dismiss.ok) {
        toast.error(dismiss.error ?? "Failed to save activation state");
        return;
      }
      router.push(userType === "gtm" ? "/accounts" : "/");
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

  // ── Searching state ──
  if (phase === "searching") {
    const searchingNoun = userType === "gtm" ? "accounts" : "roles";
    return (
      <div className="mx-auto max-w-2xl py-6 space-y-8">
        {/* Header mirrors the results phase so the transition is structural. */}
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

        {/* Structural scaffold for the cards that will land here. */}
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <ResultCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──
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

  // ── Empty state ──
  if (phase === "empty") {
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
            onClick={handleAdjustSettings}
            disabled={isPending}
          >
            <Settings size={14} />
            Adjust Settings
          </Button>
          <div className="flex items-center gap-2">
            {userType !== "gtm" && (
              <Button
                variant="outline"
                onClick={handleDeeperSearch}
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
              onClick={handleGoToDashboard}
              disabled={isPending}
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Results state ──
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
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Your top matches</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Found {headerCounts.discovered} {headerNoun}, scored{" "}
          {headerCounts.scored} — here are your {headerFit}.
        </p>
      </div>

      {/* Result cards */}
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

      {/* Gmail prompt */}
      {!gmailConnected && (
        <Card className="gap-3 p-5">
          <div className="flex items-center gap-2">
            <Mail size={16} />
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
              <ExternalLink size={13} />
              Connect Gmail
            </a>
            {/* "Skip for now" is implicit — they can just proceed to dashboard */}
          </div>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Gmail is optional. The pipeline can discover, score, and draft
            emails without it.
          </p>
        </Card>
      )}

      {/* Bottom actions */}
      <div className="flex items-center justify-between">
        {!isGtm && (
          <Button
            variant="outline"
            onClick={handleDeeperSearch}
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
        <Button onClick={handleGoToDashboard} disabled={isPending}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
