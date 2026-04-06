"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Check } from "lucide-react";
import { saveMemoryDocumentAction } from "./actions";
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
      if (!result.error) setSaved(true);
    });
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/memory" className="btn-ghost p-1.5 rounded-md">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaved(false);
            }}
            className="text-xl font-semibold bg-transparent outline-none w-full"
          />
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {doc.document_key} · {doc.origin}
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="btn-primary flex items-center gap-1.5"
          disabled={isPending}
        >
          {saved ? <Check size={13} /> : <Save size={13} />}
          {isPending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        className="input min-h-[500px] resize-y font-mono text-xs leading-relaxed whitespace-pre-wrap"
      />
    </div>
  );
}
