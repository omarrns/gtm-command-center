"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import type { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CyclicLoader } from "@/components/ui/cyclic-loader";
import { EditableProseSection } from "@/components/ui/editable-prose-section";

export interface DocumentSection {
  key: string;
  title: string;
  kind: "text" | "list";
}

interface StreamingDocumentReaderProps<T extends Record<string, unknown>> {
  // Stream wiring — endpoint receives submitBody as JSON, must stream a
  // structured object matching `schema` (server-side via `streamObject`).
  endpoint: string;
  submitBody: Record<string, unknown>;
  // `unknown` for the input slot lets schemas with `.default()` flow
  // through — `.default()` makes the input optional while the output
  // stays required, which `z.ZodType<T>` alone won't accept.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  sections: readonly DocumentSection[];
  // If provided, skip the stream entirely and render the document as
  // already-complete. Used for refresh / round-trip cases where the
  // result has been persisted from a prior stream completion.
  initialValue: T | null;

  // Header copy. Two subtitles so the screen can speak differently while
  // streaming vs. once the document is complete.
  headerTitle: string;
  headerSubtitleStreaming: string;
  headerSubtitleReady: string;

  // Ambient indicator messages — visible until every section has landed.
  cyclicMessages: string[];

  saveLabel?: string;
  backLabel?: string;
  // onSave receives the full assembled value plus the set of keys the
  // user actually edited. Caller decides whether to forward edits to a
  // server action or no-op when nothing changed.
  onSave: (value: T, dirtyKeys: ReadonlySet<keyof T>) => Promise<void>;
  // Omit to hide the back button entirely.
  onBack?: () => Promise<void>;
}

const EMPTY_TEXT = "";
const EMPTY_LIST: string[] = [];

export function StreamingDocumentReader<T extends Record<string, unknown>>({
  endpoint,
  submitBody,
  schema,
  sections,
  initialValue,
  headerTitle,
  headerSubtitleStreaming,
  headerSubtitleReady,
  cyclicMessages,
  saveLabel = "Save & finish",
  backLabel = "Back",
  onSave,
  onBack,
}: StreamingDocumentReaderProps<T>) {
  const [isPending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Partial<T>>({});

  const { object, submit, isLoading, error } = useObject({
    api: endpoint,
    schema,
  });

  // Auto-submit on mount when there's no persisted value.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (initialValue || submittedRef.current) return;
    submittedRef.current = true;
    submit(submitBody);
  }, [initialValue, submit, submitBody]);

  function valueFor<K extends keyof T>(key: K): T[K] {
    const edited = edits[key];
    if (edited !== undefined) return edited as T[K];
    const live = object?.[key];
    if (live !== undefined && live !== null) return live as T[K];
    if (initialValue) return initialValue[key];
    const section = sections.find((s) => s.key === (key as string));
    return (section?.kind === "list" ? EMPTY_LIST : EMPTY_TEXT) as T[K];
  }

  function commitText(key: keyof T) {
    return (next: string) => {
      setEdits((prev) => ({ ...prev, [key]: next as T[keyof T] }));
    };
  }

  function commitList(key: keyof T) {
    return (next: string[]) => {
      setEdits((prev) => ({ ...prev, [key]: next as T[keyof T] }));
    };
  }

  // A section is "ready" when its value is a non-empty string or
  // non-empty array. While streaming, sections appear progressively.
  function isReady(key: string): boolean {
    if (initialValue) return true;
    const v = object?.[key as keyof typeof object];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  const allReady =
    !isLoading && sections.every((s) => isReady(s.key)) && !error;

  function handleSave() {
    const dirtyKeys = new Set(Object.keys(edits) as Array<keyof T>);
    const fullValue = {} as T;
    for (const s of sections) {
      (fullValue as Record<string, unknown>)[s.key] = valueFor(
        s.key as keyof T,
      );
    }
    startTransition(async () => {
      try {
        await onSave(fullValue, dirtyKeys);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function handleBack() {
    if (!onBack) return;
    startTransition(async () => {
      try {
        await onBack();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-xl px-6 py-12"
    >
      <header className="mb-10">
        <h1 className="text-xl font-semibold tracking-tight">{headerTitle}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          {allReady ? headerSubtitleReady : headerSubtitleStreaming}
        </p>
      </header>

      {error && (
        <Alert className="mb-6">
          <AlertTriangle size={14} />
          <div className="text-xs">
            <p className="font-medium">Couldn&apos;t finish.</p>
            <p className="text-[var(--color-text-muted)]">
              {error.message}. Refresh to try again.
            </p>
          </div>
        </Alert>
      )}

      {sections.map((s) => {
        if (!isReady(s.key)) return null;
        if (s.kind === "text") {
          return (
            <EditableProseSection
              key={s.key}
              title={s.title}
              kind="text"
              value={valueFor(s.key as keyof T) as string}
              onCommit={commitText(s.key as keyof T)}
              editable={allReady}
            />
          );
        }
        return (
          <EditableProseSection
            key={s.key}
            title={s.title}
            kind="list"
            value={valueFor(s.key as keyof T) as string[]}
            onCommit={commitList(s.key as keyof T)}
            editable={allReady}
          />
        );
      })}

      {!allReady && !error && (
        <div className="py-6">
          <CyclicLoader messages={cyclicMessages} />
        </div>
      )}

      <div className="mt-12 flex items-center justify-between border-t border-[var(--color-border-strong)] pt-6">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={isPending}
          >
            <ArrowLeft size={14} />
            {backLabel}
          </Button>
        ) : (
          <div />
        )}
        <Button
          type="button"
          onClick={handleSave}
          disabled={!allReady || isPending}
        >
          {isPending ? "Saving…" : saveLabel}
        </Button>
      </div>
    </motion.div>
  );
}
