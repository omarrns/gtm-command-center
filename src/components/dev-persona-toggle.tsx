"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { setUserTypeAction } from "@/app/(app)/dev-actions";
import type { UserType } from "@/lib/supabase/types";

export function DevPersonaToggle({
  currentType,
}: {
  currentType: UserType | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next: "gtm" | "job_seeker" =
    currentType === "gtm" ? "job_seeker" : "gtm";
  const label =
    currentType === "gtm"
      ? "GTM"
      : currentType === "job_seeker"
        ? "Job Seeker"
        : "—";
  const nextLabel = next === "gtm" ? "GTM" : "Job Seeker";

  function handleClick() {
    startTransition(async () => {
      await setUserTypeAction(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={`Dev: switch to ${nextLabel}`}
      className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] px-2.5 py-1 rounded-md border border-dashed border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
    >
      <ArrowLeftRight size={11} />
      <span className="font-medium">{label}</span>
    </button>
  );
}
