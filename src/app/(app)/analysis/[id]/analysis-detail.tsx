"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
} from "@phosphor-icons/react/ssr";
import { useJobPoll } from "@/lib/jobs/use-job-poll";
import { formatRelativeTime } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailHeader } from "@/components/detail-header";
import type { AnalysisRow } from "@/lib/supabase/types";
import type { Obj } from "../_components/result-guards";
import { ImportedMarkdownView } from "../_components/views/imported-markdown-view";
import { CompanyFitView } from "../_components/views/company-fit-view";
import { StandardAnalysisView } from "../_components/views/standard-analysis-view";

export function AnalysisDetail({
  analysis: initial,
}: {
  analysis: AnalysisRow;
}) {
  const router = useRouter();
  const needsPolling =
    initial.status === "running" || initial.status === "draft";
  const { job, isComplete, fetchError, pollingStopped } = useJobPoll(
    needsPolling ? initial.job_id : null,
  );

  useEffect(() => {
    if (isComplete && needsPolling) {
      router.refresh();
    }
  }, [isComplete, needsPolling, router]);

  const result = initial.result as Obj | null;
  const isRunning = initial.status === "running" && !pollingStopped;
  const isFailed = initial.status === "failed";

  const isImported = result?.imported === true;
  const isCompanyFit = initial.skill_slug === "company-fit-analyzer";

  return (
    <div className="max-w-4xl">
      <DetailHeader
        backHref="/"
        backLabel="Back to Today"
        title={`${initial.company_name ?? "Analysis"} ${initial.role_title ? `— ${initial.role_title}` : ""}`}
        subtitle={
          <>
            <Badge variant="muted">{initial.skill_slug}</Badge>{" "}
            {formatRelativeTime(initial.created_at)}
          </>
        }
      />

      {isRunning && (
        <Alert className="mb-6">
          <ArrowsClockwise className="animate-spin text-[var(--color-blue)]" />
          <AlertTitle>Analysis running…</AlertTitle>
          <AlertDescription>
            Researching company and synthesizing results. This usually takes
            60–90 seconds.
          </AlertDescription>
        </Alert>
      )}

      {isFailed && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>
            {job?.error ?? "Unknown error. Check logs."}
          </AlertDescription>
        </Alert>
      )}

      {pollingStopped && needsPolling && !isFailed && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Lost connection to job</AlertTitle>
          <AlertDescription>
            Stopped polling after repeated failures
            {fetchError ? ` (${fetchError})` : ""}. The job may still be running
            — refresh the page to retry.
          </AlertDescription>
        </Alert>
      )}

      {result && isImported && <ImportedMarkdownView result={result} />}

      {result && !isImported && isCompanyFit && (
        <CompanyFitView result={result} />
      )}

      {result && !isImported && !isCompanyFit && (
        <StandardAnalysisView result={result} />
      )}
    </div>
  );
}
