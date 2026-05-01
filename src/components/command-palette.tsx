"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  Eye,
  MagnifyingGlass as Search,
  Gear as Settings,
  UserCircle as UserRound,
  VideoCamera as Video,
} from "@phosphor-icons/react/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { UserType } from "@/lib/supabase/types";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  icon: PhosphorIcon;
};

// SPEC-3 polish: persona drives the / label. GTM gets "Go to ICP"
// because that's what the homepage renders for them. Other commands
// are persona-agnostic in v1.
function buildItems(userType: UserType | null): PaletteItem[] {
  const homeLabel = userType === "gtm" ? "Go to ICP" : "Go to Today";
  const baseItems: PaletteItem[] = [
    { id: "today", label: homeLabel, href: "/", icon: CalendarCheck },
    { id: "history", label: "Go to History", href: "/history", icon: Clock },
    {
      id: "watchlist",
      label: "Go to Watchlist",
      href: "/watchlist",
      icon: Eye,
    },
    {
      id: "settings",
      label: "Go to Settings",
      href: "/settings",
      icon: Settings,
    },
  ];

  if (userType === "gtm") {
    return [
      baseItems[0],
      {
        id: "video-icp",
        label: "Go to Video ICP",
        href: "/video-icp",
        icon: Video,
      },
      ...baseItems.slice(1),
    ];
  }

  return [
    baseItems[0],
    {
      id: "profile",
      label: "Go to Profile",
      href: "/profile",
      icon: UserRound,
    },
    ...baseItems.slice(1),
  ];
}

const PANEL_SPRING = { type: "spring", stiffness: 480, damping: 36 } as const;
const RESULT_CAP = 8;

interface CommandPaletteProps {
  userType: UserType | null;
}

export function CommandPalette({ userType }: CommandPaletteProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    function onToggle() {
      setOpen((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("command-palette:toggle", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("command-palette:toggle", onToggle);
    };
  }, []);

  // Reset query + focus on every open. rAF defer so focus lands after the
  // mount paint, not during it — prevents the cursor from appearing before
  // the panel has settled.
  useEffect(() => {
    if (!open) return;
    // Reset visible state on every open — one-time sync, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setActiveIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const items = useMemo(() => buildItems(userType), [userType]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return items.slice(0, RESULT_CAP);
    return items
      .filter((item) => item.label.toLowerCase().includes(q))
      .slice(0, RESULT_CAP);
  }, [items, query]);

  useEffect(() => {
    // Clamp highlight into the current result window. Can't be useMemo
    // because activeIndex is user-driven (arrow keys) — this effect only
    // fires when the list shrinks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex((i) =>
      filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1),
    );
  }, [filtered.length]);

  function select(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) select(item);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onKeyDown={onKeyDown}
          onMouseDown={() => setOpen(false)}
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh] backdrop-blur-sm"
        >
          <motion.div
            onMouseDown={(e) => e.stopPropagation()}
            initial={
              reduceMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: -8, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }
            }
            transition={reduceMotion ? { duration: 0 } : PANEL_SPRING}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
              <Search
                size={16}
                className="shrink-0 text-[var(--color-text-muted)]"
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a command or search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Type a command or search"
                className="h-11 flex-1 border-0 bg-transparent px-0 text-sm outline-none placeholder:text-[var(--color-text-subtle)]"
              />
              <kbd className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--color-text-muted)]">
                esc
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-[var(--color-text-muted)]">
                  No matching commands.
                </p>
              ) : (
                <ul role="listbox" aria-label="Commands">
                  {filtered.map((item, i) => {
                    const active = i === activeIndex;
                    const Icon = item.icon;
                    return (
                      <li key={item.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(i)}
                          onMouseDown={(e) => {
                            // Commit on mousedown so click events don't race with
                            // the overlay's close handler.
                            e.preventDefault();
                            e.stopPropagation();
                            select(item);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                            active
                              ? "bg-[var(--color-surface-muted)] text-[var(--color-text)]"
                              : "text-[var(--color-text)]",
                          )}
                        >
                          <Icon
                            size={16}
                            className="shrink-0 text-[var(--color-text-muted)]"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                          <AnimatePresence initial={false}>
                            {active && (
                              <motion.span
                                key="caret"
                                initial={
                                  reduceMotion ? false : { opacity: 0, x: -2 }
                                }
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.1 }}
                                className="shrink-0 text-[var(--color-text-muted)]"
                              >
                                <ArrowRight size={14} />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)]/40 px-3 py-2 text-[10px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Key>↑</Key>
                  <Key>↓</Key>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <Key>↵</Key>
                  open
                </span>
              </span>
              <span>
                {filtered.length} of {items.length}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] leading-none">
      {children}
    </kbd>
  );
}
