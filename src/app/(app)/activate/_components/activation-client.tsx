"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink, Play, Settings, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { triggerPipelineAction } from "../../actions";
import { dismissActivationAction } from "../actions";
import type {
  ActivationResult,
  ActivationSearchResult,
} from "@/lib/pipeline/activation";
import { OpportunityCard } from "../../_components/opportunity-card";

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
}

export function ActivationClient({
  gmailConnected,
  scoreThreshold,
}: ActivationClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("searching");
  const [data, setData] = useState<ActivationSearchResult | null>(null);
  const [results, setResults] = useState<ActivationResult[]>([]);
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
    try {
      const res = await fetch("/api/activation/search", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error ??
            `Search failed (${res.status})`,
        );
      }
      const result: ActivationSearchResult = await res.json();
      setData(result);
      setResults(result.results);
      setPhase(result.results.length > 0 ? "results" : "empty");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation search failed");
      setPhase("error");
    }
  }, []);

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
      router.push("/");
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
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="h-3 w-3 rounded-full bg-[var(--color-blue)] animate-pulse" />
        <p className="text-sm text-[var(--color-text-muted)] transition-opacity">
          {REASSURANCE_MESSAGES[messageIndex]}
        </p>
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
    return (
      <div className="mx-auto max-w-lg py-16 space-y-5">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">
            No matches in the last 10 days
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            We searched for your configured queries but didn&apos;t find
            matching roles posted recently.
          </p>
        </div>
        <div className="surface p-4 space-y-1.5">
          <p className="text-sm font-medium">Try:</p>
          <ul className="text-sm text-[var(--color-text-muted)] list-disc pl-5 space-y-1">
            <li>Broadening your search queries in Settings</li>
            <li>Adding more locations</li>
            <li>Running a deeper search (checks the full month)</li>
          </ul>
        </div>
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
  return (
    <div className="mx-auto max-w-2xl py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Your top matches</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Found {data?.stats.discovered ?? 0} roles, scored{" "}
          {(data?.stats.scored ?? 0) + (data?.stats.filtered ?? 0)} — here are
          your best fits.
        </p>
      </div>

      {/* Result cards */}
      <div className="space-y-2">
        {results.map((r) => (
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
        <div className="surface p-5 space-y-3">
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
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center justify-between">
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
        <Button onClick={handleGoToDashboard} disabled={isPending}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
