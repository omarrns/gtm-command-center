"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Command, Menu, Sun, Moon } from "lucide-react";

const TITLES: Record<string, string> = {
  "/analysis": "Analysis",
  "/outreach": "Outreach",
  "/research": "Research",
  "/coaching": "Coaching",
  "/memory": "Memory",
  "/trail": "Trail",
  "/workspace-tools": "Workspace Tools",
};

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const key = Object.keys(TITLES).find(
    (k) => pathname === k || pathname.startsWith(`${k}/`),
  );
  const title = key ? TITLES[key] : "GTM Command Center";

  return (
    <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between px-4 md:px-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <h1 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label="Toggle theme"
        >
          <Sun size={16} className="hidden dark:block" />
          <Moon size={16} className="block dark:hidden" />
        </button>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("command-palette:toggle"))
          }
          className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] px-3 py-1.5 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] transition-colors"
        >
          <Command size={12} />
          <span>Command</span>
          <kbd className="font-mono text-xs text-[var(--color-text-subtle)]">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
