"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Clock, Eye, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/(public)/login/actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { href: "/", label: "Today", icon: CalendarCheck },
  { href: "/history", label: "History", icon: Clock },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarNavProps {
  user: { email: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SidebarContent({
  user,
  onLinkClick,
}: {
  user: { email: string };
  onLinkClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Logo region */}
      <div className="px-5 pt-6 pb-6">
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--color-text-subtle)]">
          GTM
        </div>
        <div className="text-sm font-bold tracking-tight mt-0.5">
          Command Center
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="px-3 flex-1 space-y-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-lg text-sm",
                "px-3 py-2.5",
                "motion-safe:transition-[background-color,color,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.25,0.1,0.25,1)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
                active
                  ? "bg-[var(--color-surface-muted)] text-[var(--color-text)] font-medium"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] motion-safe:active:opacity-70",
              )}
            >
              {/* Active indicator — inset pill instead of border-left */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-[var(--color-blue)]"
                />
              )}
              <Icon size={16} className="shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: user info + sign out */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="px-3 py-2">
          <div className="text-xs font-medium text-[var(--color-text-muted)] truncate">
            {user.email}
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
              "text-[var(--color-text-muted)]",
              "motion-safe:transition-[background-color,color,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.25,0.1,0.25,1)]",
              "hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
              "motion-safe:active:opacity-70",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
            )}
          >
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export function SidebarNav({ user, open, onOpenChange }: SidebarNavProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex-col">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile sidebar (Sheet drawer) */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-60 p-0 bg-[var(--color-surface)] flex flex-col"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent user={user} onLinkClick={() => onOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
