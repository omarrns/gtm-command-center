"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";

interface StorySectionTextProps {
  title: string;
  kind: "text";
  value: string;
  onCommit: (next: string) => void;
  editable: boolean;
}

interface StorySectionListProps {
  title: string;
  kind: "list";
  value: string[];
  onCommit: (next: string[]) => void;
  editable: boolean;
}

type StorySectionProps = StorySectionTextProps | StorySectionListProps;

export function StorySection(props: StorySectionProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initialDraft =
    props.kind === "text" ? props.value : props.value.join("\n");
  const [draft, setDraft] = useState(initialDraft);

  // Keep draft in sync with incoming value when not actively editing (streaming).
  useEffect(() => {
    if (editing) return;
    setDraft(props.kind === "text" ? props.value : props.value.join("\n"));
  }, [props.kind, props.value, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  function commit() {
    if (props.kind === "text") {
      if (draft !== props.value) props.onCommit(draft);
    } else {
      const next = draft
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const same =
        next.length === props.value.length &&
        next.every((v, i) => v === props.value[i]);
      if (!same) props.onCommit(next);
    }
    setEditing(false);
  }

  function startEdit() {
    if (!props.editable) return;
    setDraft(props.kind === "text" ? props.value : props.value.join("\n"));
    setEditing(true);
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-8"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
        {props.title}
      </h2>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={Math.max(3, draft.split("\n").length + 1)}
          className="w-full text-sm text-[var(--color-text)] leading-relaxed bg-transparent border border-[var(--color-blue)] rounded-md p-3 resize-none focus:outline-none"
        />
      ) : (
        <div
          onClick={startEdit}
          className={`text-sm text-[var(--color-text)] leading-relaxed ${props.editable ? "cursor-text rounded-md -mx-1 px-1 hover:bg-[var(--color-surface-muted)]" : ""}`}
        >
          {props.kind === "text" ? (
            <p className="whitespace-pre-wrap">{props.value}</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {props.value.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </motion.section>
  );
}
