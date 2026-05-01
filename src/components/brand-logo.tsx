import { cn } from "@/lib/utils";

interface BrandLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function BrandLogo({ collapsed = false, className }: BrandLogoProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 text-[var(--color-text)]",
        className,
      )}
      role="img"
      aria-label="Searchcraft"
    >
      <SearchcraftMark className="h-7 w-7 shrink-0" />
      {!collapsed && (
        <span className="truncate text-sm font-semibold tracking-tight">
          Searchcraft
        </span>
      )}
    </div>
  );
}

function SearchcraftMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="7"
        fill="var(--color-surface)"
        stroke="var(--color-border)"
      />
      <circle
        cx="14.5"
        cy="14.5"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20 20l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M14.5 11.5l2.2 5.8-5.8-2.2 2.6-1z"
        fill="var(--color-blue)"
      />
      <path
        d="M10.5 22h5c1.8 0 3-1.2 3-3v-2"
        fill="none"
        stroke="var(--color-text-subtle)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
