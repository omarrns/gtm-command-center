"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { saveEmailDraftAction } from "../actions";
import { cn } from "@/lib/utils";
import type { EmailDraftRow } from "@/lib/supabase/types";

export function DraftEditor({
  drafts,
  activeDraftId,
}: {
  drafts: EmailDraftRow[];
  activeDraftId: string;
}) {
  const [activeIdx, setActiveIdx] = useState(
    () => drafts.findIndex((d) => d.id === activeDraftId) || 0,
  );
  const draft = drafts[activeIdx];
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function switchVariant(idx: number) {
    setActiveIdx(idx);
    setSubject(drafts[idx].subject ?? "");
    setBody(drafts[idx].body ?? "");
    setSaved(false);
  }

  function onSave() {
    setSaved(false);
    const fd = new FormData();
    fd.set("draft_id", draft.id);
    fd.set("subject", subject);
    fd.set("body", body);
    startTransition(async () => {
      const result = await saveEmailDraftAction(fd);
      if (!result.error) setSaved(true);
    });
  }

  async function onCopy() {
    const text = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/outreach" className="btn-ghost p-1.5 rounded-md">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold truncate">
            {draft.recipient_name} @ {draft.company_name}
          </h2>
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            <span className="badge">
              {draft.draft_type.replace("email-", "")}
            </span>
          </div>
        </div>
      </div>

      {/* Variant tabs */}
      {drafts.length > 1 ? (
        <div className="flex gap-1 mb-5">
          {drafts.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => switchVariant(i)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activeIdx === i
                  ? "bg-[var(--color-text)] text-white"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
            >
              Variant {i + 1}
            </button>
          ))}
        </div>
      ) : null}

      {/* Reasoning note */}
      {String((draft.context as Record<string, unknown>)?.reasoning ?? "") !==
        "" && (
        <div className="surface-muted p-4 mb-5">
          <div className="text-[11px] font-medium text-[var(--color-text-subtle)] mb-1">
            Why this variant
          </div>
          <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {String((draft.context as Record<string, unknown>).reasoning ?? "")}
          </div>
        </div>
      )}

      {/* Editable fields */}
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Subject
          </span>
          <input
            className="input"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
            Body
          </span>
          <textarea
            className="input min-h-[300px] resize-y text-sm leading-relaxed whitespace-pre-wrap"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button
          type="button"
          onClick={onSave}
          className="btn-primary"
          disabled={isPending}
        >
          {isPending ? "Saving…" : saved ? "Saved" : "Save Draft"}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="btn-ghost border border-[var(--color-border)] flex items-center gap-1.5 text-xs"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}
