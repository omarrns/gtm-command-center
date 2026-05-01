"use client";

import { useState } from "react";
import {
  Plus,
  X,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TagInputProps {
  values: string[];
  onChange: (next: string[]) => void;
  inputId: string;
  label: string;
  description: string;
  placeholder: string;
  /** Singular form used in validation messages (e.g. "query", "location"). */
  itemNoun: string;
  /** Plural form used in the count-cap message. Defaults to `${itemNoun}s`. */
  itemNounPlural?: string;
  maxCount?: number;
  maxLength?: number;
  /**
   * Suggested values rendered as click-to-add chips below the input.
   * Used for enum_multi sub-dimensions (stages, geographies, etc.) so
   * the user sees the canonical option set without typing it from
   * memory. Already-selected options are hidden from the suggestion
   * row. Free-form entry is still allowed — passing `options` is a
   * hint, not a constraint.
   */
  options?: ReadonlyArray<{ value: string; label: string }>;
}

export function TagInput({
  values,
  onChange,
  inputId,
  label,
  description,
  placeholder,
  itemNoun,
  itemNounPlural,
  maxCount = 10,
  maxLength = 100,
  options,
}: TagInputProps) {
  const [buffer, setBuffer] = useState("");
  const plural = itemNounPlural ?? `${itemNoun}s`;
  const capitalized = itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1);

  function add(raw?: string) {
    const trimmed = (raw ?? buffer).trim();
    if (!trimmed) return;
    if (trimmed.length > maxLength) {
      toast.error(`${capitalized} must be ${maxLength} characters or less`);
      return;
    }
    if (values.length >= maxCount) {
      toast.error(`Maximum ${maxCount} ${plural}`);
      return;
    }
    if (values.includes(trimmed)) {
      toast.error(`Duplicate ${itemNoun}`);
      return;
    }
    onChange([...values, trimmed]);
    if (raw === undefined) setBuffer("");
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  const unselectedOptions =
    options?.filter((opt) => !values.includes(opt.value)) ?? [];

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <p className="text-xs text-[var(--color-text-subtle)]">{description}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((value, i) => (
          <Badge key={i} variant="muted">
            {value}
            <button
              type="button"
              onClick={() => remove(i)}
              className="hover:text-[var(--color-danger)] transition-colors"
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
      </div>
      {values.length < maxCount && (
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            type="text"
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            maxLength={maxLength}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => add()}
            disabled={!buffer.trim()}
          >
            <Plus size={14} />
            Add
          </Button>
        </div>
      )}
      {unselectedOptions.length > 0 && values.length < maxCount && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {unselectedOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => add(opt.value)}
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
