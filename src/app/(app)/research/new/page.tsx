"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enqueueResearchJobAction } from "../actions";

export default function NewResearchPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await enqueueResearchJobAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.reportId) {
        router.push(`/research/reports/${result.reportId}`);
      }
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">New Research Run</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Enter a company name and role to run Exa-backed people and company
          research. Results include CEO, hiring manager, source URLs, and
          personalization angles.
        </p>
      </div>
      <form action={onSubmit} className="space-y-5">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Company name
          </span>
          <input
            className="input"
            name="company_name"
            required
            placeholder="e.g. Pylon"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Role title
          </span>
          <input
            className="input"
            name="role_title"
            required
            placeholder="e.g. GTM Engineer"
          />
        </label>
        <input type="hidden" name="research_type" value="people-research" />
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? "Starting…" : "Start Research"}
          </button>
          {isPending && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Enqueuing background research…
            </span>
          )}
        </div>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </form>
    </div>
  );
}
