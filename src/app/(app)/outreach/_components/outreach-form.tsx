"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateEmailDraftAction } from "../actions";

interface Prefill {
  companyName?: string;
  roleTitle?: string;
  analysisId?: string;
}

export function OutreachForm({ prefill }: { prefill: Prefill }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await generateEmailDraftAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.draftIds?.[0]) {
        router.push(`/outreach/${result.draftIds[0]}`);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      {prefill.analysisId && (
        <input type="hidden" name="analysis_id" value={prefill.analysisId} />
      )}
      <input
        type="hidden"
        name="draft_type"
        value="email-b2b-customer-support"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Recipient name
          </span>
          <Input name="recipient_name" required placeholder="Marty Kausas" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Recipient title
          </span>
          <Input name="recipient_title" placeholder="CEO" />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Company
          </span>
          <Input
            name="company_name"
            required
            defaultValue={prefill.companyName ?? ""}
            placeholder="Pylon"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Role title{" "}
            <span className="text-[var(--color-text-subtle)]">(optional)</span>
          </span>
          <Input
            name="role_title"
            defaultValue={prefill.roleTitle ?? ""}
            placeholder="GTM Engineer"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Generating…" : "Generate Draft"}
        </Button>
        {isPending && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Drafting (~8s)…
          </span>
        )}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
    </form>
  );
}
