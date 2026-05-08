// =============================================================================
// InlineListEditor
// =============================================================================
//
// Per-item editable bulleted list. Bullets stay visible during edit (native
// <ul>/<li> rendering), one <input> per item. Keyboard model:
//   • Enter at end of item → new empty item below, focus moves to it
//   • Backspace on empty item → remove it, focus previous item (preserves caret
//     at end)
//   • ArrowUp / ArrowDown → move focus between items
//
// Commits on blur-out-of-container: React's synthetic onBlur bubbles via
// focusout, so listening on the <ul> catches focus leaving the whole list.
// Focus moving BETWEEN inputs inside the list does NOT trigger commit
// (checked via relatedTarget containment).
//
// Called by EditableField and EditableProseSection when kind="list" and the
// user clicks into edit mode. The caller owns editing-state bool; this
// component signals via onExit when focus leaves so caller can flip back.
// =============================================================================

"use client";

import { useState, useRef, useEffect } from "react";

interface InlineListEditorProps {
  value: string[];
  onCommit: (next: string[]) => void;
  onExit: () => void;
  placeholder?: string;
}

export function InlineListEditor({
  value,
  onCommit,
  onExit,
  placeholder,
}: InlineListEditorProps) {
  // Always at least one row so there's something to focus and type into when
  // the user clicks into an empty list.
  const [draft, setDraft] = useState<string[]>(value.length > 0 ? value : [""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const didExitRef = useRef(false);

  // Focus the last item on mount. User clicked anywhere on the list to
  // enter edit mode; last-item-focus is the natural "continue the list" spot.
  useEffect(() => {
    const idx = inputRefs.current.length - 1;
    const input = inputRefs.current[idx];
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, []);

  function commitAndExit() {
    if (didExitRef.current) return;
    didExitRef.current = true;
    const cleaned = draft.map((s) => s.trim()).filter(Boolean);
    const same =
      cleaned.length === value.length &&
      cleaned.every((v, i) => v === value[i]);
    if (!same) onCommit(cleaned);
    onExit();
  }

  function updateAt(index: number, newValue: string) {
    setDraft((d) => d.map((v, i) => (i === index ? newValue : v)));
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      setDraft((d) => [...d.slice(0, index + 1), "", ...d.slice(index + 1)]);
      // New input not in the DOM yet — defer focus to next tick.
      setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
    } else if (
      e.key === "Backspace" &&
      draft[index] === "" &&
      draft.length > 1
    ) {
      e.preventDefault();
      setDraft((d) => d.filter((_, i) => i !== index));
      const prevIdx = Math.max(0, index - 1);
      setTimeout(() => {
        const prev = inputRefs.current[prevIdx];
        if (prev) {
          prev.focus();
          prev.setSelectionRange(prev.value.length, prev.value.length);
        }
      }, 0);
    } else if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowDown" && index < draft.length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLUListElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      commitAndExit();
    }
  }

  return (
    <ul className="list-disc pl-5 space-y-0.5" onBlur={handleBlur}>
      {draft.map((item, i) => (
        <li key={i}>
          <input
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            value={item}
            placeholder={i === 0 ? placeholder : undefined}
            onChange={(e) => updateAt(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="block w-full text-sm text-[var(--color-text)] leading-relaxed bg-transparent border-0 p-0 m-0 focus:outline-none placeholder:text-[var(--color-text-subtle)] placeholder:italic"
          />
        </li>
      ))}
    </ul>
  );
}
