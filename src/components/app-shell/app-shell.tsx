"use client";

import { useEffect, useState } from "react";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { TopBar } from "@/components/app-shell/top-bar";
import { LazyCommandPalette } from "@/components/app-shell/lazy-command-palette";
import type { UserType } from "@/lib/supabase/types";

const COLLAPSE_STORAGE_KEY = "gtm:sidebar-collapsed";

export function AppShell({
  user,
  userType,
  children,
}: {
  user: { email: string };
  userType: UserType | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    // Deferred read: initial state must match SSR (false) to avoid hydration mismatch,
    // then sync from localStorage after mount.
    if (window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      COLLAPSE_STORAGE_KEY,
      sidebarCollapsed ? "1" : "0",
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b";
      if (!isShortcut) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      setSidebarCollapsed((c) => !c);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="h-screen flex overflow-hidden">
      <SidebarNav
        user={user}
        userType={userType}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} userType={userType} />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
            {children}
          </div>
        </main>
      </div>
      <LazyCommandPalette userType={userType} />
    </div>
  );
}
