"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useJobPoll } from "@/lib/jobs/use-job-poll";
import { formatRelativeTime } from "@/lib/utils";
import { DetailHeader } from "@/components/detail-header";
import { StatusBanner } from "@/components/status-banner";
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
  const { job, isComplete } = useJobPoll(needsPolling ? initial.job_id : null);

  useEffect(() => {
    if (isComplete && needsPolling) {
      router.refresh();
    }
  }, [isComplete, needsPolling, router]);

  const result = initial.result as Obj | null;
  const isRunning = initial.status === "running";
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
            <span className="badge">{initial.skill_slug}</span>{" "}
            {formatRelativeTime(initial.created_at)}
          </>
        }
      />

      {isRunning && (
        <StatusBanner
          status="running"
          title="Analysis running…"
          detail="Researching company and synthesizing results. This usually takes 60–90 seconds."
        />
      )}

      {isFailed && (
        <StatusBanner
          status="failed"
          title="Analysis failed"
          detail={job?.error ?? "Unknown error. Check logs."}
        />
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
