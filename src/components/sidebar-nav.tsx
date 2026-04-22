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
  PanelLeftClose,
  PanelLeftOpen,
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
import type { UserType } from "@/lib/supabase/types";

interface NavItem {
  href: string;
  label: string;
  icon: typeof CalendarCheck;
}

// SPEC-3 Phase 6.c: persona-aware nav. GTM relabels "Today" → "ICP"
// (same / route — that's where IcpDashboard lives) and hides
// /analytics (no pipeline output to chart in v1). job_seeker / null
// keep the original five-item nav.
function buildNav(userType: UserType | null): NavItem[] {
  if (userType === "gtm") {
    return [
      { href: "/", label: "ICP", icon: CalendarCheck },
      { href: "/history", label: "History", icon: Clock },
      { href: "/watchlist", label: "Watchlist", icon: Eye },
      { href: "/settings", label: "Settings", icon: Settings },
    ];
  }
  return [
    { href: "/", label: "Today", icon: CalendarCheck },
    { href: "/history", label: "History", icon: Clock },
    { href: "/watchlist", label: "Watchlist", icon: Eye },
    { href: "/analytics", label: "Analytics", icon: BarChart2 },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
}

const WIDTH_SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;
const PILL_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;
const FADE = { duration: 0.15, ease: "easeOut" } as const;

interface SidebarNavProps {
  user: { email: string };
  userType: UserType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

function SidebarContent({
  user,
  userType,
  collapsed,
  reduceMotion,
  layoutId,
  onLinkClick,
  onToggleCollapsed,
}: {
  user: { email: string };
  userType: UserType | null;
  collapsed: boolean;
  reduceMotion: boolean;
  layoutId: string;
  onLinkClick?: () => void;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const navItems = buildNav(userType);

  return (
    <>
      {/* Logo region */}
      <div
        className={cn(
          "pt-4 pb-3 px-3 flex",
          collapsed ? "justify-center" : "justify-end",
        )}
      >
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (⌘B)`}
            aria-label={`${collapsed ? "Expand" : "Collapse"} sidebar`}
            className="h-7 w-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main navigation"
        className={cn("flex-1 space-y-0.5", collapsed ? "px-2" : "px-3")}
      >
        <LayoutGroup id={layoutId}>
          {navItems.map((item) => {
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
  userType,
  open,
  onOpenChange,
  collapsed = false,
  onToggleCollapsed,
}: SidebarNavProps) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 200 }}
        transition={reduceMotion ? { duration: 0 } : WIDTH_SPRING}
        className="hidden md:flex shrink-0 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg)] flex-col sticky top-0 h-screen"
      >
        <SidebarContent
          user={user}
          userType={userType}
          collapsed={collapsed}
          reduceMotion={!!reduceMotion}
          layoutId="sidebar-nav-desktop"
          onToggleCollapsed={onToggleCollapsed}
        />
      </motion.aside>

      {/* Mobile sidebar (Sheet drawer) — always full width */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[200px] p-0 bg-[var(--color-bg)] flex flex-col"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            user={user}
            userType={userType}
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
