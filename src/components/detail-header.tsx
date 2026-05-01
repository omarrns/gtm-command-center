import Link from "next/link";
import {
  ArrowLeft,
} from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

interface DetailHeaderProps {
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}

export function DetailHeader({
  backHref,
  backLabel = "Back",
  title,
  subtitle,
  children,
}: DetailHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Link
        href={backHref}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        aria-label={backLabel}
      >
        <ArrowLeft size={16} />
      </Link>
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight truncate">
          {title}
        </h2>
        {subtitle && (
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
