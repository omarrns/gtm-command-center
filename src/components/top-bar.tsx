"use client";

import { usePathname } from "next/navigation";
import { Command } from "lucide-react";

const TITLES: Record<string, string> = {
  "/analysis": "Analysis",
  "/outreach": "Outreach",
  "/research": "Research",
  "/coaching": "Coaching",
  "/memory": "Memory",
  "/trail": "Trail",
  "/workspace-tools": "Workspace Tools",
};

export function TopBar() {
  const pathname = usePathname();
  const key = Object.keys(TITLES).find(
    (k) => pathname === k || pathname.startsWith(`${k}/`),
  );
  const title = key ? TITLES[key] : "GTM Command Center";

  return (
    <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between px-8">
      <h1 className="text-sm font-semibold text-[var(--color-text)]">
        {title}
      </h1>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("command-palette:toggle"))
        }
        className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] px-3 py-1.5 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] transition-colors"
      >
        <Command size={12} />
        <span>Command</span>
        <kbd className="font-mono text-[10px] text-[var(--color-text-subtle)]">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}
