// =============================================================================
// EditableProseSection
// =============================================================================
//
// Click-to-edit prose section. Display mode shows the value as a paragraph
// (kind="text") or a bulleted list (kind="list"); clicking flips into edit
// mode. Text fields swap to an invisible auto-sizing textarea. List fields
// hand off to InlineListEditor, which keeps bullets visible during edit —
// one <input> per item, Enter creates a new bullet, Backspace on empty
// removes it.
//
// No "Edit" button, no save/cancel — click to type, blur to commit.
//
// Props (discriminated union by `kind`):
//   title     — section heading (rendered uppercase + muted)
//   kind      — "text" or "list"
//   value     — current value (string for text, string[] for list)
//   onCommit  — called on blur with the new value (only when changed)
//   editable  — when false, click does nothing — useful while a value is
//               still streaming in and shouldn't be touched yet
//
// Animation: section fades + rises on mount. Editing chrome is invisible —
// no border, no padding shift — so edit mode feels like a document cursor
// landing on the text, not a form control appearing.
//
// Pairs naturally with StreamingDocumentReader, which renders one of these
// per section descriptor.
// =============================================================================

"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { InlineListEditor } from "./inline-list-editor";

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

  // Text-kind draft is refreshed when editing starts. Display mode renders
  // props.value directly, so streamed updates remain visible until the user
  // starts editing. List-kind state lives in InlineListEditor.
  const [draft, setDraft] = useState(props.kind === "text" ? props.value : "");

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
    if (!props.editable) return;
    if (props.kind === "text") setDraft(props.value);
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
          />
        )
      ) : (
        <div
          onClick={startEdit}
          className={`text-sm text-[var(--color-text)] leading-relaxed ${props.editable ? "cursor-text rounded-sm -mx-1 px-1 hover:bg-[var(--color-surface-muted)]" : ""}`}
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
