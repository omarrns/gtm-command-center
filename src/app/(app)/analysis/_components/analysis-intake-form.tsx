"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  runJdRubricAction,
  enqueueCompanyAnalysisAction,
  enqueueFullAnalysisAction,
} from "../actions";

type Mode = "jd-rubric" | "company" | "full";

export function AnalysisIntakeForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const showJd = mode === "jd-rubric" || mode === "full";
  const showCompany = mode === "company" || mode === "full";

  function onSubmit(formData: FormData) {
    setError(null);

    // Auto-detect full analysis: if both company and JD are present and mode allows
    const hasJd = !!formData.get("job_description")?.toString().trim();
    const hasCompany = !!formData.get("company_name")?.toString().trim();
    const effectiveMode =
      mode === "jd-rubric" && hasCompany && hasJd ? "full" : mode;

    startTransition(async () => {
      let result: { error?: string; analysisId?: string; jobId?: string };

      if (effectiveMode === "jd-rubric") {
        result = await runJdRubricAction(formData);
      } else if (effectiveMode === "company") {
        result = await enqueueCompanyAnalysisAction(formData);
      } else {
        result = await enqueueFullAnalysisAction(formData);
      }

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.analysisId) {
        router.push(`/analysis/${result.analysisId}`);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      {showCompany && (
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Company name
          </span>
          <Input
            name="company_name"
            placeholder="e.g. Pylon"
            required={mode === "company"}
          />
        </label>
      )}

      {(showCompany || mode === "jd-rubric") && (
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Role title{" "}
            <span className="text-[var(--color-text-subtle)]">(optional)</span>
          </span>
          <Input name="role_title" placeholder="e.g. GTM Engineer" />
        </label>
      )}

      {showJd && (
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Job description
          </span>
          <Textarea
            className="min-h-[200px] resize-y font-mono text-xs leading-relaxed"
            name="job_description"
            placeholder="Paste the full job description here…"
            required={mode === "jd-rubric"}
          />
        </label>
      )}

      {mode === "jd-rubric" && (
        <p className="text-xs text-[var(--color-text-subtle)]">
          Tip: If you also enter a company name, this automatically runs a full
          analysis (company research + JD scoring) instead of a quick rubric.
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Analyzing…"
            : mode === "company"
              ? "Run Company Analysis"
              : mode === "full"
                ? "Run Full Analysis"
                : "Score JD"}
        </Button>
        {isPending && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {mode === "jd-rubric"
              ? "Running rubric (~10s)…"
              : "Enqueuing background research…"}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
    </form>
  );
}
