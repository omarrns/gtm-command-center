// =============================================================================
// EditableField
// =============================================================================
//
// Inline click-to-edit field for a labeled value living inside a form-style
// section. Pairs with ReviewFormSection (which owns the section heading and
// entrance animation) — EditableField handles just one labeled row.
//
// Where EditableProseSection is the document-level primitive (its own
// motion.section + uppercase heading + mb-8 rhythm), EditableField is the
// field-level primitive (muted sub-label + inline value, no wrapper motion).
//
// Display mode: muted label + value rendered as paragraph (text) or bulleted
// list (list). Click the value to enter edit mode — text fields swap to an
// invisible auto-sizing textarea, list fields hand off to InlineListEditor
// (per-item inputs that keep bullets visible). Both commit on blur.
//
// Props (discriminated union by `kind`):
//   label       — sub-label shown above the value (sentence case, muted)
//   kind        — "text" or "list"
//   value       — current value (string for text, string[] for list)
//   onCommit    — called on blur with the new value (only when changed)
//   placeholder — shown when value is empty (display mode)
// =============================================================================

"use client";

import { useState, useRef, useEffect } from "react";
import { InlineListEditor } from "./inline-list-editor";

interface EditableFieldTextProps {
  label: string;
  kind: "text";
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
}

interface EditableFieldListProps {
  label: string;
  kind: "list";
  value: string[];
  onCommit: (next: string[]) => void;
  placeholder?: string;
}

type EditableFieldProps = EditableFieldTextProps | EditableFieldListProps;

export function EditableField(props: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Text-kind draft state lives here. List-kind state lives in
  // InlineListEditor — it manages its own per-item array and commits
  // a fully-cleaned string[] back to this component on exit.
  const [draft, setDraft] = useState(props.kind === "text" ? props.value : "");

  useEffect(() => {
    if (editing) return;
    if (props.kind === "text") setDraft(props.value);
  }, [props.kind, props.value, editing]);

  useEffect(() => {
    if (editing && props.kind === "text" && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing, props.kind]);

  function commitText() {
    if (props.kind !== "text") return;
    if (draft !== props.value) props.onCommit(draft);
    setEditing(false);
  }

  function startEdit() {
    if (props.kind === "text") setDraft(props.value);
    setEditing(true);
  }

  const isEmpty =
    props.kind === "text" ? !props.value : props.value.length === 0;
  const placeholder = props.placeholder ?? "Click to add";

  return (
    <div className="space-y-1">
      <p className="text-xs text-[var(--color-text-muted)]">{props.label}</p>
      {editing ? (
        props.kind === "text" ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitText}
            rows={1}
            className="block w-full text-sm text-[var(--color-text)] leading-relaxed bg-transparent border-0 p-0 m-0 resize-none focus:outline-none field-sizing-content"
          />
        ) : (
          <InlineListEditor
            value={props.value}
            onCommit={props.onCommit}
            onExit={() => setEditing(false)}
            placeholder={placeholder}
          />
        )
      ) : (
        <div
          onClick={startEdit}
          className="text-sm text-[var(--color-text)] leading-relaxed cursor-text hover:bg-[var(--color-surface-muted)] rounded-sm -mx-1 px-1"
        >
          {isEmpty ? (
            <p className="text-[var(--color-text-subtle)] italic">
              {placeholder}
            </p>
          ) : props.kind === "text" ? (
            <p className="whitespace-pre-wrap">{props.value}</p>
          ) : (
            <ul className="list-disc pl-5 space-y-0.5">
              {props.value.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
