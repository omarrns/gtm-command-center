import Link from "next/link";
import type { ReactNode } from "react";

interface ListItemProps {
  href: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
}

export function ListItem({ href, title, subtitle, meta }: ListItemProps) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-card ring-1 ring-foreground/10 flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface-muted)] hover:shadow-sm transition-all duration-150"
    >
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {meta && <div className="flex items-center gap-2 shrink-0">{meta}</div>}
    </Link>
  );
}
