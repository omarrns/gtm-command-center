"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

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
}: TagInputProps) {
  const [buffer, setBuffer] = useState("");
  const plural = itemNounPlural ?? `${itemNoun}s`;
  const capitalized = itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1);

  function add() {
    const trimmed = buffer.trim();
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
    setBuffer("");
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

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
          <input
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
            className="input flex-1"
          />
          <button
            type="button"
            onClick={add}
            disabled={!buffer.trim()}
            className="btn-ghost flex items-center gap-1 text-xs"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      )}
    </div>
  );
}
