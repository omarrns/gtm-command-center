"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EmailDraftRow } from "@/lib/supabase/types";
import { updateSelectedDraftAction, editDraftAction } from "../actions";

interface EmailVariantPickerProps {
  drafts: EmailDraftRow[];
  selectedDraftId: string | null;
  opportunityId: string;
  /** When true, variants are display-only — no select, edit, or send actions. */
  readOnly?: boolean;
  /** When provided, renders a per-variant Send button that selects the draft and sends. */
  onSend?: (draftId: string) => void;
  /** Disables Send buttons while a parent-level action is in flight. */
  isSending?: boolean;
}

export function EmailVariantPicker({
  drafts,
  selectedDraftId,
  opportunityId,
  readOnly = false,
  onSend,
  isSending = false,
}: EmailVariantPickerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isPending, startTransition] = useTransition();

  if (drafts.length === 0) return null;

  function handleSelect(draftId: string) {
    if (readOnly) return;
    if (draftId === selectedDraftId) return;
    startTransition(async () => {
      const result = await updateSelectedDraftAction(opportunityId, draftId);
      if (!result.ok) toast.error(result.error);
    });
  }

  function startEdit(draft: EmailDraftRow) {
    setEditingId(draft.id);
    setEditSubject(draft.subject ?? "");
    setEditBody(draft.body ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditSubject("");
    setEditBody("");
  }

  function saveEdit(draftId: string) {
    startTransition(async () => {
      const result = await editDraftAction(draftId, editSubject, editBody);
      if (result.ok) {
        setEditingId(null);
        toast.success("Draft updated");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">
        Email Variants
      </div>
      {drafts.map((draft) => {
        const isSelected = draft.id === selectedDraftId;
        const isEditing = editingId === draft.id;
        const showActions = !readOnly && !isEditing;

        return (
          <div
            key={draft.id}
            className={cn(
              "surface-muted p-3 transition-colors",
              isSelected && "ring-1 ring-[var(--color-blue)]",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                type="button"
                onClick={() => handleSelect(draft.id)}
                disabled={readOnly || isEditing}
                className={cn(
                  "flex items-center gap-1.5 -m-1 px-1 py-0.5 rounded",
                  !readOnly &&
                    !isEditing &&
                    "hover:bg-[var(--color-surface)] cursor-pointer",
                )}
                aria-label={`Select variant ${draft.variant_index + 1}`}
              >
                {isSelected && (
                  <Check size={12} className="text-[var(--color-blue)]" />
                )}
                <span className="text-xs font-medium">
                  Variant {draft.variant_index + 1}
                </span>
              </button>
              {showActions && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => startEdit(draft)}
                    disabled={isPending || isSending}
                    aria-label="Edit variant"
                  >
                    <Pencil size={12} />
                  </Button>
                  {onSend && (
                    <Button
                      size="xs"
                      onClick={() => onSend(draft.id)}
                      disabled={isPending || isSending}
                    >
                      <Send size={12} />
                      Send
                    </Button>
                  )}
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <input
                  className="input text-xs"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Subject"
                />
                <textarea
                  className="input text-xs min-h-[180px] resize-y whitespace-pre-wrap"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Body"
                />
                <div className="flex gap-1.5">
                  <Button
                    size="xs"
                    onClick={() => saveEdit(draft.id)}
                    disabled={isPending}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={cancelEdit}
                    disabled={isPending}
                  >
                    <X size={12} />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-xs font-semibold leading-relaxed">
                  {draft.subject}
                </div>
                <div className="text-xs text-[var(--color-text)] leading-relaxed mt-1.5 whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {draft.body}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
