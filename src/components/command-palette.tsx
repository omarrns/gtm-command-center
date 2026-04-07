"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Compass,
  Mail,
  Search,
  Sparkles,
  BookOpen,
  Wrench,
  ClipboardList,
  Plus,
} from "lucide-react";

const COMMANDS = [
  {
    group: "Navigate",
    items: [
      {
        id: "nav:analysis",
        label: "Go to Analysis",
        href: "/analysis",
        icon: Compass,
      },
      {
        id: "nav:outreach",
        label: "Go to Outreach",
        href: "/outreach",
        icon: Mail,
      },
      {
        id: "nav:research",
        label: "Go to Research",
        href: "/research",
        icon: Search,
      },
      {
        id: "nav:coaching",
        label: "Go to Coaching",
        href: "/coaching",
        icon: Sparkles,
      },
      {
        id: "nav:memory",
        label: "Go to Memory",
        href: "/memory",
        icon: BookOpen,
      },
      {
        id: "nav:trail",
        label: "Go to Trail",
        href: "/trail",
        icon: ClipboardList,
      },
      {
        id: "nav:tools",
        label: "Go to Workspace Tools",
        href: "/workspace-tools",
        icon: Wrench,
      },
    ],
  },
  {
    group: "New",
    items: [
      {
        id: "new:jd",
        label: "New JD rubric",
        href: "/analysis/job",
        icon: Plus,
      },
      {
        id: "new:company",
        label: "New company analysis",
        href: "/analysis/company",
        icon: Plus,
      },
      {
        id: "new:outreach",
        label: "New outreach draft",
        href: "/outreach/new",
        icon: Plus,
      },
      {
        id: "new:research",
        label: "New research run",
        href: "/research/new",
        icon: Plus,
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
