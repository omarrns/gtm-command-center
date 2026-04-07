"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CalendarCheck, Clock, Eye, Settings } from "lucide-react";

const COMMANDS = [
  {
    group: "Navigate",
    items: [
      {
        id: "nav:today",
        label: "Go to Today",
        href: "/",
        icon: CalendarCheck,
      },
      {
        id: "nav:history",
        label: "Go to History",
        href: "/history",
        icon: Clock,
      },
      {
        id: "nav:watchlist",
        label: "Go to Watchlist",
        href: "/watchlist",
        icon: Eye,
      },
      {
        id: "nav:settings",
        label: "Go to Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function toggle() {
      setOpen((v) => !v);
    }
    window.addEventListener("keydown", handler);
    window.addEventListener("command-palette:toggle", toggle);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("command-palette:toggle", toggle);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg surface shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette">
          <Command.Input
            placeholder="Type a command or search…"
            className="w-full px-4 py-3 text-sm bg-transparent border-b border-[var(--color-border)] outline-none"
          />
          <Command.List className="max-h-80 overflow-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
              No matching commands.
            </Command.Empty>
            {COMMANDS.map((group) => (
              <Command.Group
                key={group.group}
                heading={group.group}
                className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-subtle)] px-2 pt-2 pb-1"
              >
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${group.group} ${item.label}`}
                      onSelect={() => {
                        setOpen(false);
                        router.push(item.href);
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm cursor-pointer data-[selected=true]:bg-[var(--color-surface-muted)]"
                    >
                      <Icon
                        size={14}
                        className="text-[var(--color-text-muted)]"
                      />
                      {item.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
