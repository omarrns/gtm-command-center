"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SectionHeader({
  title,
  isExpanded,
  onToggle,
}: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full py-2"
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {isExpanded ? (
        <ChevronUp size={14} className="text-[var(--color-text-subtle)]" />
      ) : (
        <ChevronDown size={14} className="text-[var(--color-text-subtle)]" />
      )}
    </button>
  );
}
