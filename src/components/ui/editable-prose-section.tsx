// =============================================================================
// EditableProseSection
// =============================================================================
//
// Click-to-edit prose section. Display mode shows the value as a paragraph
// (kind="text") or a bulleted list (kind="list"); clicking the value flips
// the section to a textarea that commits on blur. Designed for long-form
// content where editing should feel like correcting a document, not filling
// out a form — there's no "Edit" button, no save/cancel, just click to type.
//
// List values are entered as one item per line in edit mode; blank lines
// are dropped, items are trimmed.
//
// Props (discriminated union by `kind`):
//   title     — section heading (rendered uppercase + muted)
//   kind      — "text" or "list"
//   value     — current value (string for text, string[] for list)
//   onCommit  — called on blur with the new value (only when changed)
//   editable  — when false, click does nothing — useful while a value is
//               still streaming in and shouldn't be touched yet
//
// Animation: section fades + rises on mount. The internal textarea has no
// resize handle and grows to fit content via row count.
//
// Pairs naturally with StreamingDocumentReader, which renders one of these
// per section descriptor.
// =============================================================================

"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";

interface EditableProseSectionTextProps {
  title: string;
  kind: "text";
  value: string;
  onCommit: (next: string) => void;
  editable: boolean;
}

interface EditableProseSectionListProps {
  title: string;
  kind: "list";
  value: string[];
  onCommit: (next: string[]) => void;
  editable: boolean;
}

type EditableProseSectionProps =
  | EditableProseSectionTextProps
  | EditableProseSectionListProps;

export function EditableProseSection(props: EditableProseSectionProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initialDraft =
    props.kind === "text" ? props.value : props.value.join("\n");
  const [draft, setDraft] = useState(initialDraft);

  // Keep draft in sync with incoming value when not actively editing
  // (e.g. a stream is still updating the field).
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
