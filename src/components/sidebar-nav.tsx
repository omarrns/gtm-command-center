"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Mail,
  Search,
  Sparkles,
  BookOpen,
  Wrench,
  ClipboardList,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/(public)/login/actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { href: "/analysis", label: "Analysis", icon: Compass },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/research", label: "Research", icon: Search },
  { href: "/coaching", label: "Coaching", icon: Sparkles },
  { href: "/memory", label: "Memory", icon: BookOpen },
  { href: "/trail", label: "Trail", icon: ClipboardList },
  { href: "/workspace-tools", label: "Workspace", icon: Wrench },
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
      <div className="px-5 pt-6 pb-5">
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--color-text-subtle)]">
          GTM
        </div>
        <div className="text-sm font-bold tracking-tight mt-0.5">
          Command Center
        </div>
      </div>
      <nav aria-label="Main navigation" className="px-3 flex-1 space-y-0.5">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-[var(--color-surface-muted)] text-[var(--color-text)] font-medium border-l-2 border-[var(--color-blue)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
              )}
            >
              <Icon size={15} className="shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-[var(--color-border)]">
        <div className="px-3 py-2">
          <div className="text-xs text-[var(--color-text-subtle)]">
            Signed in
          </div>
          <div className="text-xs font-medium truncate">{user.email}</div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <LogOut size={13} />
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
