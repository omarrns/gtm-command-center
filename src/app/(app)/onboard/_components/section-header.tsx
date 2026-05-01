"use client";
import {
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react/ssr";

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
        <CaretUp size={14} className="text-[var(--color-text-subtle)]" />
      ) : (
        <CaretDown size={14} className="text-[var(--color-text-subtle)]" />
      )}
    </button>
  );
}
