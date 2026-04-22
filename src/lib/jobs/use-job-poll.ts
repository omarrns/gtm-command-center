"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { JobRow, JobStatus } from "@/lib/supabase/types";

const POLL_INTERVAL_BASE = 3_000;
const POLL_INTERVAL_MAX = 30_000;
const TERMINAL: JobStatus[] = ["complete", "failed"];
const MAX_CONSECUTIVE_FAILURES = 5;

interface PollState {
  job: JobRow | null;
  fetchError: string | null;
  consecutiveFailures: number;
}

const INITIAL_STATE: PollState = {
  job: null,
  fetchError: null,
  consecutiveFailures: 0,
};

/**
 * Client-side hook that polls /api/jobs/[id] until the job reaches a
 * terminal state. Surfaces fetch errors to the consumer (previously they
 * were silently swallowed, leading to infinite spinners).
 *
 * Backoff: starts at 3s, doubles after each consecutive failure up to 30s,
 * gives up after MAX_CONSECUTIVE_FAILURES so the UI can show a real
 * "stopped polling" state instead of spinning forever.
 */
export function useJobPoll(jobId: string | null) {
  const stateRef = useRef<PollState>(INITIAL_STATE);
  const listenersRef = useRef(new Set<() => void>());

  const store = useMemo(
    () => ({
      subscribe(cb: () => void) {
        listenersRef.current.add(cb);
        return () => listenersRef.current.delete(cb);
      },
      getSnapshot() {
        return stateRef.current;
      },
    }),
    [],
  );

  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useEffect(() => {
    if (!jobId) {
      if (
        stateRef.current.job !== null ||
        stateRef.current.fetchError !== null ||
        stateRef.current.consecutiveFailures !== 0
      ) {
        stateRef.current = INITIAL_STATE;
        listenersRef.current.forEach((cb) => cb());
      }
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval = POLL_INTERVAL_BASE;

    async function fetchJob(): Promise<JobRow | null> {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!active) return null;
        if (!res.ok) {
          throw new Error(`/api/jobs/${jobId} returned ${res.status}`);
        }
        const data = (await res.json()) as JobRow;
        stateRef.current = {
          job: data,
          fetchError: null,
          consecutiveFailures: 0,
        };
        interval = POLL_INTERVAL_BASE;
        listenersRef.current.forEach((cb) => cb());
        return data;
      } catch (err) {
        if (!active) return null;
        const msg = err instanceof Error ? err.message : String(err);
        const failures = stateRef.current.consecutiveFailures + 1;
        interval = Math.min(
          POLL_INTERVAL_MAX,
          POLL_INTERVAL_BASE * 2 ** (failures - 1),
        );
        stateRef.current = {
          job: stateRef.current.job,
          fetchError: msg,
          consecutiveFailures: failures,
        };
        // Visible warning so devs aren't blind to silent poll failures.
        console.warn(
          `[useJobPoll] fetch failed for jobId=${jobId} (attempt ${failures}, next retry ${interval}ms): ${msg}`,
        );
        listenersRef.current.forEach((cb) => cb());
        return null;
      }
    }

    function scheduleNext() {
      if (!active) return;
      if (stateRef.current.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `[useJobPoll] giving up on jobId=${jobId} after ${stateRef.current.consecutiveFailures} consecutive failures`,
        );
        return;
      }
      const data = stateRef.current.job;
      if (data && TERMINAL.includes(data.status)) return;
      timer = setTimeout(loop, interval);
    }

    async function loop() {
      await fetchJob();
      scheduleNext();
    }

    loop();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const job = state.job;
  const givenUp = state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

  return {
    job,
    /** Last client-side fetch error (network / 4xx / 5xx). Null on success. */
    fetchError: state.fetchError,
    /** True once polling has been abandoned after MAX_CONSECUTIVE_FAILURES. */
    pollingStopped: givenUp,
    consecutiveFailures: state.consecutiveFailures,
    isLoading:
      jobId != null && !givenUp && (!job || !TERMINAL.includes(job.status)),
    isComplete: job?.status === "complete",
    /** True if the job itself failed OR the client gave up polling. */
    isFailed: job?.status === "failed" || givenUp,
    isRunning: job?.status === "running",
    result: job?.result ?? null,
    /** Unified error surface: server-reported job error, else client fetch error. */
    error: job?.error ?? state.fetchError ?? null,
  };
}
