"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  Clock,
  Eye,
  Settings,
  LogOut,
  BarChart2,
} from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/(public)/login/actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { href: "/", label: "Today", icon: CalendarCheck },
  { href: "/history", label: "History", icon: Clock },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const WIDTH_SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;
const PILL_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;
const FADE = { duration: 0.15, ease: "easeOut" } as const;

interface SidebarNavProps {
  user: { email: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collapsed?: boolean;
}

function SidebarContent({
  user,
  collapsed,
  reduceMotion,
  layoutId,
  onLinkClick,
}: {
  user: { email: string };
  collapsed: boolean;
  reduceMotion: boolean;
  layoutId: string;
  onLinkClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Logo region */}
      <div className={cn("pt-6 pb-6", collapsed ? "px-3" : "px-5")}>
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div
              key="mark"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
              className="text-center text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--color-text-subtle)]"
            >
              GTM
            </motion.div>
          ) : (
            <motion.div
              key="wordmark"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
            >
              <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--color-text-subtle)]">
                GTM
              </div>
              <div className="text-base font-bold tracking-tight mt-0.5">
                Command Center
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main navigation"
        className={cn("flex-1 space-y-0.5", collapsed ? "px-2" : "px-3")}
      >
        <LayoutGroup id={layoutId}>
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onLinkClick}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center rounded-lg text-sm",
                  "transition-[color,opacity] duration-[120ms] ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1",
                  collapsed
                    ? "h-10 w-10 justify-center mx-auto"
                    : "gap-2.5 px-3 py-2.5",
                  active
                    ? "text-[var(--color-text)] font-medium"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    transition={reduceMotion ? { duration: 0 } : PILL_SPRING}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-lg bg-[var(--color-surface-muted)]"
                  />
                )}
                <Icon
                  size={16}
                  className={cn(
                    "relative z-10 shrink-0",
                    active && "text-[var(--color-blue)]",
                  )}
                  aria-hidden="true"
                />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={FADE}
                      className="relative z-10 whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </LayoutGroup>
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "pb-3 pt-2 border-t border-[var(--border)]",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {collapsed ? (
          <form action={signOutAction} className="flex justify-center">
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                "text-[var(--color-text-muted)]",
                "transition-[color,background-color,opacity] duration-[120ms] ease-out",
                "hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1",
              )}
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </form>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key="expanded-footer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
            >
              <div className="px-3 py-2">
                <div className="text-xs text-[var(--color-text-subtle)] truncate">
                  {user.email}
                </div>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
                    "text-[var(--color-text-muted)]",
                    "transition-[color,background-color,opacity] duration-[120ms] ease-out",
                    "hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1",
                  )}
                >
                  <LogOut size={14} aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </>
  );
}

export function SidebarNav({
  user,
  open,
  onOpenChange,
  collapsed = false,
}: SidebarNavProps) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={reduceMotion ? { duration: 0 } : WIDTH_SPRING}
        className="hidden md:flex shrink-0 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg)] flex-col sticky top-0 h-screen"
      >
        <SidebarContent
          user={user}
          collapsed={collapsed}
          reduceMotion={!!reduceMotion}
          layoutId="sidebar-nav-desktop"
        />
      </motion.aside>

      {/* Mobile sidebar (Sheet drawer) — always full width */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-60 p-0 bg-[var(--color-bg)] flex flex-col"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            user={user}
            collapsed={false}
            reduceMotion={!!reduceMotion}
            layoutId="sidebar-nav-mobile"
            onLinkClick={() => onOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
