import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  hint?: string;
  children?: ReactNode;
}

export function EmptyState({ message, hint, children }: EmptyStateProps) {
  return (
    <div className="surface-muted flex flex-col items-center justify-center py-16 text-center">
      <p className="text-base text-[var(--color-text-muted)] mb-2">{message}</p>
      {hint && (
        <p className="text-xs text-[var(--color-text-subtle)] mb-4">{hint}</p>
      )}
      {!hint && children && <div className="mt-2" />}
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}
