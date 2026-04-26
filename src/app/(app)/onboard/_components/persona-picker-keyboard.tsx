"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface PersonaPickerKeyboardProps {
  jobSearchHref: string;
  icpHref: string;
}

export function PersonaPickerKeyboard({
  jobSearchHref,
  icpHref,
}: PersonaPickerKeyboardProps) {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Digit1") {
        event.preventDefault();
        router.push(jobSearchHref);
      } else if (event.code === "Digit2") {
        event.preventDefault();
        router.push(icpHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jobSearchHref, icpHref, router]);

  return (
    <div className="mt-8 flex items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
      <span>Press</span>
      <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--color-text-muted)]">
        1
      </kbd>
      <span>or</span>
      <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--color-text-muted)]">
        2
      </kbd>
      <span>to choose</span>
    </div>
  );
}
