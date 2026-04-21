"use client";

import { useState, useTransition } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { saveEmailDraftAction } from "../actions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DetailHeader } from "@/components/detail-header";
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
      if (!result.error) {
        setSaved(true);
        toast.success("Draft saved");
      }
      if (result.error) toast.error("Failed to save draft");
    });
  }

  async function onCopy() {
    const text = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl">
      <DetailHeader
        backHref="/outreach"
        backLabel="Back to outreach"
        title={`${draft.recipient_name} @ ${draft.company_name}`}
        subtitle={
          <Badge variant="muted">
            {draft.draft_type.replace("email-", "")}
          </Badge>
        }
      />

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
          <div className="text-xs font-medium text-[var(--color-text-subtle)] mb-1">
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
          <Input
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
          <Textarea
            className="min-h-[300px] resize-y whitespace-pre-wrap text-sm leading-relaxed"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending ? "Saving…" : saved ? "Saved" : "Save Draft"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onCopy}
          aria-label="Copy to clipboard"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy to clipboard"}
        </Button>
      </div>
    </div>
  );
}
