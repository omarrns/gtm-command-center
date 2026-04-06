"use client";

import { useState, useTransition } from "react";
import { startCoachingSessionAction } from "./actions";
import { useJobPoll } from "@/lib/jobs/use-job-poll";

interface CoachingResult {
  session_title: string;
  key_insights: string[];
  next_steps: Array<{ action: string; owner: string; by_when?: string }>;
  trail_entry: string | null;
  themes?: string[];
  decisions_made?: string[];
  open_questions?: string[];
}

export default function CoachingPage() {
  const [transcript, setTranscript] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const { isComplete, isFailed, result } = useJobPoll(jobId);

  // Derive sessionResult from poll data — no setState-in-effect needed
  const sessionResult: CoachingResult | null =
    isComplete && result ? (result as unknown as CoachingResult) : null;

  function onSubmit(formData: FormData) {
    setError(null);
    setJobId(null);
    startTransition(async () => {
      const res = await startCoachingSessionAction(formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.jobId) setJobId(res.jobId);
    });
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Coaching</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Paste a coaching session transcript or notes. The coach reads your
          memory context and produces a structured summary with next steps and a
          TRAIL entry.
        </p>
      </div>

      {!sessionResult ? (
        <form action={onSubmit} className="space-y-5">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
              Session transcript / notes
            </span>
            <textarea
              className="input min-h-[250px] resize-y font-mono text-xs leading-relaxed"
              name="transcript"
              required
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your session notes, chat export, or free-form thoughts…"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="btn-primary"
              disabled={isPending || !!jobId}
            >
              {isPending
                ? "Submitting…"
                : jobId
                  ? "Processing…"
                  : "Run Coaching Session"}
            </button>
            {jobId && !isComplete && !isFailed && (
              <span className="text-xs text-[var(--color-text-muted)]">
                Synthesizing session summary (~30s)…
              </span>
            )}
          </div>
          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}
          {isFailed && (
            <p className="text-sm text-[var(--color-danger)]">
              Session failed. Try again.
            </p>
          )}
        </form>
      ) : (
        <div className="space-y-6">
          {/* Session title */}
          <div className="surface p-5">
            <h3 className="text-lg font-semibold">
              {sessionResult.session_title}
            </h3>
          </div>

          {/* Key insights */}
          {sessionResult.key_insights.length > 0 && (
            <div className="surface p-5">
              <h4 className="text-sm font-semibold mb-3">Key Insights</h4>
              <ul className="space-y-2">
                {sessionResult.key_insights.map((ins, i) => (
                  <li
                    key={i}
                    className="text-xs text-[var(--color-text-muted)] leading-relaxed flex items-start gap-2"
                  >
                    <span className="text-[var(--color-accent)] font-bold">
                      {i + 1}.
                    </span>{" "}
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps */}
          {sessionResult.next_steps.length > 0 && (
            <div className="surface p-5">
              <h4 className="text-sm font-semibold mb-3">Next Steps</h4>
              <div className="space-y-2">
                {sessionResult.next_steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">{s.action}</span>
                      <span className="text-[var(--color-text-subtle)]">
                        {" "}
                        — {s.owner}
                        {s.by_when ? `, by ${s.by_when}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trail entry */}
          {sessionResult.trail_entry && (
            <div className="surface-muted p-5">
              <h4 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                TRAIL Entry (auto-appended)
              </h4>
              <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--color-text-muted)] leading-relaxed">
                {sessionResult.trail_entry}
              </pre>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setJobId(null);
              setTranscript("");
            }}
            className="btn-ghost border border-[var(--color-border)] text-xs"
          >
            Start New Session
          </button>
        </div>
      )}
    </div>
  );
}
