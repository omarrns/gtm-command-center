"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EmailDraftRow } from "@/lib/supabase/types";
import { updateSelectedDraftAction, editDraftAction } from "../actions";

interface EmailVariantPickerProps {
  drafts: EmailDraftRow[];
  selectedDraftId: string | null;
  opportunityId: string;
  /** When true, variants are display-only — no select or edit actions. */
  readOnly?: boolean;
}

export function EmailVariantPicker({
  drafts,
  selectedDraftId,
  opportunityId,
  readOnly = false,
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

        return (
          <div
            key={draft.id}
            className={cn(
              "surface-muted p-3 transition-colors",
              !readOnly && "cursor-pointer",
              isSelected && "ring-1 ring-[var(--color-blue)]",
            )}
            onClick={() => !isEditing && handleSelect(draft.id)}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                {isSelected && (
                  <Check size={12} className="text-[var(--color-blue)]" />
                )}
                <span className="text-xs font-medium">
                  Variant {draft.variant_index + 1}
                </span>
              </div>
              {isSelected && !isEditing && !readOnly && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(draft);
                  }}
                >
                  <Pencil size={12} />
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                <input
                  className="input text-xs"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Subject"
                />
                <textarea
                  className="input text-xs min-h-[80px] resize-y"
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
                <div className="text-xs font-medium truncate">
                  {draft.subject}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-0.5">
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
