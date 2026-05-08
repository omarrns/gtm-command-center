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
import {
  Plus,
} from "@phosphor-icons/react/ssr";
import { InlineListEditor } from "./inline-list-editor";

interface EditableFieldOption {
  value: string;
  label: string;
}

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
  // Suggestion chips rendered below the bulleted display value. Click a
  // chip to append it via onCommit. Used by the GTM dashboard for the
  // enum_multi sub-dimensions (stages, geographies, stage_disqualifiers)
  // so the canonical option set is one click away rather than typed
  // from memory. Free-form entry via InlineListEditor is unchanged.
  options?: ReadonlyArray<EditableFieldOption>;
}

interface EditableFieldEnumProps {
  label: string;
  kind: "enum";
  value: string;
  onCommit: (next: string) => void;
  options: ReadonlyArray<EditableFieldOption>;
  placeholder?: string;
}

type EditableFieldProps =
  | EditableFieldTextProps
  | EditableFieldListProps
  | EditableFieldEnumProps;

export function EditableField(props: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Text-kind draft is refreshed when editing starts. Display mode renders
  // props.value directly, so incoming streamed updates are not hidden by draft
  // state. List-kind state lives in InlineListEditor.
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
    if (props.kind === "text") setDraft(props.value);
    setEditing(true);
  }

  const isEmpty =
    props.kind === "list" ? props.value.length === 0 : !props.value;
  const placeholder = props.placeholder ?? "Click to add";

  // enum kind has its own render path — no editing mode toggle, the
  // native <select> is always interactive (no save-on-blur dance to
  // worry about), so the rest of the function stays untouched.
  if (props.kind === "enum") {
    const matched = props.options.find((o) => o.value === props.value);
    return (
      <div className="space-y-1">
        <p className="text-xs text-[var(--color-text-muted)]">{props.label}</p>
        <select
          value={props.value}
          onChange={(e) => props.onCommit(e.target.value)}
          className="block w-full text-sm text-[var(--color-text)] bg-transparent border-0 p-0 -mx-0 cursor-pointer focus:outline-none"
        >
          <option value="">{placeholder}</option>
          {props.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {matched === undefined && props.value && (
          <p className="text-[10px] text-[var(--color-warning)]">
            Stored as &quot;{props.value}&quot; — not in the canonical option
            list.
          </p>
        )}
      </div>
    );
  }

  const listOptions = props.kind === "list" ? props.options : undefined;
  const unselectedListOptions = listOptions
    ? listOptions.filter((opt) => !props.value.includes(opt.value))
    : [];

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
      {props.kind === "list" &&
        unselectedListOptions.length > 0 &&
        !editing && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {unselectedListOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onCommit([...props.value, opt.value]);
                }}
                className="inline-flex items-center gap-0.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border-strong)] rounded-full px-2 py-0.5 transition-colors"
              >
                <Plus size={10} />
                {opt.label}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
