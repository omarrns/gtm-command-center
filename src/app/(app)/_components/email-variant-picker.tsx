"use client";

import { useState, useTransition } from "react";
import {
  PencilSimple as Pencil,
  X,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EmailDraftRow } from "@/lib/supabase/types";
import { editDraftAction } from "../actions";

interface EmailVariantPickerProps {
  drafts: EmailDraftRow[];
  /** When true, the draft is display-only — no edit action. */
  readOnly?: boolean;
}

export function EmailVariantPicker({
  drafts,
  readOnly = false,
}: EmailVariantPickerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isPending, startTransition] = useTransition();

  if (drafts.length === 0) return null;

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
      {drafts.map((draft) => {
        const isEditing = editingId === draft.id;
        const showActions = !readOnly && !isEditing;

        return (
          <Card key={draft.id} className="bg-muted gap-2 p-3">
            {showActions && (
              <div className="flex items-center justify-end gap-1 mb-2">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => startEdit(draft)}
                  disabled={isPending}
                  aria-label="Edit draft"
                >
                  <Pencil size={12} />
                </Button>
              </div>
            )}

            {isEditing ? (
              <div className="space-y-2">
                <Input
                  className="text-xs"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Subject"
                />
                <Textarea
                  className="min-h-[180px] resize-y whitespace-pre-wrap text-xs"
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
          </Card>
        );
      })}
    </div>
  );
}
