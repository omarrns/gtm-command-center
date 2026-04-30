"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useJobPoll } from "@/lib/jobs/use-job-poll";

export function ReviewPoller({ jobId }: { jobId: string | null }) {
  const router = useRouter();
  const refreshed = useRef(false);
  const { isLoading, isComplete, isFailed, fetchError, pollingStopped } =
    useJobPoll(jobId);

  useEffect(() => {
    if (refreshed.current) return;
    if (!isComplete && !isFailed) return;
    refreshed.current = true;
    router.refresh();
  }, [isComplete, isFailed, router]);

  if (!jobId) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Review queued. Waiting for a worker job.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
      {isLoading && <Loader2 size={14} className="animate-spin" />}
      <span>
        {pollingStopped
          ? "Polling stopped. Refresh to check the review."
          : "Review is running in the background."}
      </span>
      {fetchError && (
        <span className="text-[var(--color-danger)]">({fetchError})</span>
      )}
    </div>
  );
}
