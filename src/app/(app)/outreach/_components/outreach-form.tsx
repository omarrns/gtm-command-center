"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateEmailDraftAction } from "../actions";

const DRAFT_TYPES = [
  {
    value: "email-b2b-customer-support",
    label: "B2B CX CEO",
    desc: "CEO/founder at a B2B customer support company. Insider voice.",
  },
  {
    value: "email-head-of-growth",
    label: "Head of Growth",
    desc: "Growth leader outside Omar's insider market. Builder framing.",
  },
];

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

      <fieldset>
        <legend className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
          Email type
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {DRAFT_TYPES.map((t) => (
            <label
              key={t.value}
              className="surface px-4 py-3 cursor-pointer has-[:checked]:ring-2 has-[:checked]:ring-[var(--color-accent)] transition-shadow"
            >
              <input
                type="radio"
                name="draft_type"
                value={t.value}
                defaultChecked={t.value === "email-b2b-customer-support"}
                className="sr-only"
              />
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {t.desc}
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Recipient name
          </span>
          <input
            className="input"
            name="recipient_name"
            required
            placeholder="Marty Kausas"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Recipient title
          </span>
          <input className="input" name="recipient_title" placeholder="CEO" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Company
          </span>
          <input
            className="input"
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
          <input
            className="input"
            name="role_title"
            defaultValue={prefill.roleTitle ?? ""}
            placeholder="GTM Engineer"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Generating…" : "Generate Drafts"}
        </button>
        {isPending && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Drafting variants (~8s)…
          </span>
        )}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
    </form>
  );
}
