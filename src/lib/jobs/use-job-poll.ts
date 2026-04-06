"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { JobRow, JobStatus } from "@/lib/supabase/types";

const POLL_INTERVAL = 3_000;
const TERMINAL: JobStatus[] = ["complete", "failed"];

/**
 * Client-side hook that polls /api/jobs/[id] every 3 seconds until the job
 * reaches a terminal state. Uses useSyncExternalStore to avoid setState-in-effect.
 */
export function useJobPoll(jobId: string | null) {
  const jobRef = useRef<JobRow | null>(null);
  const listenersRef = useRef(new Set<() => void>());

  const store = useMemo(
    () => ({
      subscribe(cb: () => void) {
        listenersRef.current.add(cb);
        return () => listenersRef.current.delete(cb);
      },
      getSnapshot() {
        return jobRef.current;
      },
    }),
    [],
  );

  const job = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useEffect(() => {
    if (!jobId) {
      jobRef.current = null;
      listenersRef.current.forEach((cb) => cb());
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval>;

    async function fetchJob() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok || !active) return;
        const data = (await res.json()) as JobRow;
        jobRef.current = data;
        listenersRef.current.forEach((cb) => cb());
        return data;
      } catch {
        return null;
      }
    }

    fetchJob().then((data) => {
      if (!active) return;
      if (data && TERMINAL.includes(data.status)) return;
      timer = setInterval(async () => {
        const d = await fetchJob();
        if (d && TERMINAL.includes(d.status)) {
          clearInterval(timer);
        }
      }, POLL_INTERVAL);
    });

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId]);

  return {
    job,
    isLoading: jobId != null && (!job || !TERMINAL.includes(job.status)),
    isComplete: job?.status === "complete",
    isFailed: job?.status === "failed",
    isRunning: job?.status === "running",
    result: job?.result ?? null,
    error: job?.error ?? null,
  };
}
