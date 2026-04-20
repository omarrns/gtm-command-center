"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Command,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const ICON_SWAP = { duration: 0.18, ease: "easeOut" } as const;
const THEME_SWAP = { duration: 0.2, ease: "easeOut" } as const;

const TITLES: Record<string, string> = {
  "/": "Today",
  "/history": "History",
  "/watchlist": "Watchlist",
  "/settings": "Settings",
};

interface TopBarProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
  onToggleCollapsed: () => void;
}

export function TopBar({
  onMenuClick,
  sidebarCollapsed,
  onToggleCollapsed,
}: TopBarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const key = Object.keys(TITLES).find((k) =>
    k === "/"
      ? pathname === "/"
      : pathname === k || pathname.startsWith(`${k}/`),
  );
  const title = key ? TITLES[key] : "GTM Command Center";

  return (
    <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-between px-4 md:px-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="hidden md:inline-flex relative h-7 w-7 items-center justify-center overflow-hidden rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (⌘B)`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={sidebarCollapsed ? "open" : "close"}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={ICON_SWAP}
              className="absolute inset-0 flex items-center justify-center"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
        <h1 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="relative h-7 w-7 overflow-hidden rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          aria-label="Toggle theme"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme === "dark" ? "sun" : "moon"}
              initial={{ opacity: 0, rotate: -60, scale: 0.8 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 60, scale: 0.8 }}
              transition={THEME_SWAP}
              className="absolute inset-0 flex items-center justify-center"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </motion.span>
          </AnimatePresence>
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
