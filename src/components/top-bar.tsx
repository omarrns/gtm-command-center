"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { Menu, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DevPersonaToggle } from "@/components/dev-persona-toggle";
import type { UserType } from "@/lib/supabase/types";

const IS_DEV = process.env.NODE_ENV !== "production";

const THEME_SWAP = { duration: 0.2, ease: "easeOut" } as const;

const TITLES: Record<string, string> = {
  "/": "Today",
  "/history": "History",
  "/watchlist": "Watchlist",
  "/settings": "Settings",
  "/analytics": "Analytics",
};

interface TopBarProps {
  onMenuClick: () => void;
  userType: UserType | null;
}

export function TopBar({ onMenuClick, userType }: TopBarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const key = Object.keys(TITLES).find((k) =>
    k === "/"
      ? pathname === "/"
      : pathname === k || pathname.startsWith(`${k}/`),
  );
  // SPEC-3 polish: persona drives the / label. GTM users see "ICP"
  // because that's what the homepage renders for them; job_seeker
  // and null keep "Today". Other titles are persona-agnostic.
  const personaFallback =
    userType === "job_seeker" ? "Job Search" : "GTM Command Center";
  const baseTitle = key ? TITLES[key] : personaFallback;
  const isSignalBase = key === "/" && userType === "gtm";
  const title = isSignalBase ? "SignalBase" : baseTitle;

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
        <h1
          className={
            isSignalBase
              ? "text-lg font-medium tracking-tight text-[var(--color-text)]"
              : "text-base font-semibold tracking-tight text-[var(--color-text)]"
          }
        >
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        {IS_DEV && <DevPersonaToggle currentType={userType} />}
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
          <span>Search</span>
        </button>
      </div>
    </header>
  );
}
