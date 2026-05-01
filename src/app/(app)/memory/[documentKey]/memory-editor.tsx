"use client";

import { useState, useTransition } from "react";
import {
  FloppyDisk,
  Check,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { saveMemoryDocumentAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DetailHeader } from "@/components/detail-header";
import type { MemoryDocumentRow } from "@/lib/supabase/types";

export function MemoryEditor({ doc }: { doc: MemoryDocumentRow }) {
  const [content, setContent] = useState(doc.content);
  const [title, setTitle] = useState(doc.title);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function onSave() {
    setSaved(false);
    const fd = new FormData();
    fd.set("id", doc.id);
    fd.set("title", title);
    fd.set("content", content);
    startTransition(async () => {
      const result = await saveMemoryDocumentAction(fd);
      if (!result.error) {
        setSaved(true);
        toast.success("Document saved");
      }
      if (result.error) toast.error("Failed to save");
    });
  }

  return (
    <div className="max-w-4xl">
      <DetailHeader
        backHref="/memory"
        backLabel="Back to memory"
        title=""
        subtitle={`${doc.document_key} · ${doc.origin}`}
      >
        <Button type="button" onClick={onSave} disabled={isPending}>
          {saved ? <Check size={14} /> : <FloppyDisk size={14} />}
          {isPending ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
      </DetailHeader>

      {/* Inline title editor replaces the header title */}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setSaved(false);
        }}
        className="text-xl font-semibold bg-transparent outline-none w-full mb-6 -mt-2"
      />

      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        className="min-h-[500px] resize-y whitespace-pre-wrap font-mono text-xs leading-relaxed"
      />
    </div>
  );
}
