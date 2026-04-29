"use client";

import { humanizeEnumValue } from "@/lib/onboarding/icp-dimensions";

// Native <select> for enum_single sub-dimensions. Stable snake_case
// values are stored on the rubric; the user sees humanized labels
// ("series_a" → "Series A"). Empty string = unset.
//
// Native select rather than a shadcn dropdown because v1 wants
// keyboard-friendly + screen-reader-friendly with zero JS overhead.
// Swap to shadcn's Select when the form needs grouped options or
// rich item content.

interface EnumSelectProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  emptyLabel?: string;
}

export function EnumSelect({
  label,
  value,
  onChange,
  options,
  emptyLabel = "Select…",
}: EnumSelectProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[var(--color-text-muted)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm bg-transparent border border-transparent hover:border-[var(--color-border-strong)] focus:border-[var(--color-border-strong)] rounded-md px-2 py-1.5 outline-none transition-colors"
      >
        <option value="">{emptyLabel}</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {humanizeEnumValue(v)}
          </option>
        ))}
      </select>
    </div>
  );
}
