"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowsClockwise,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { updateIcpRubricAction } from "../_actions/update-icp-rubric";
import {
  IcpDashboardFields,
  type ArtifactSummary,
} from "./icp-dashboard-fields";
import { IcpNarrativePanel } from "./icp-narrative-panel";

const REFRESH_HREF = "/onboard?mode=refresh&template=icp_definition";

interface IcpDashboardClientProps {
  initialRubric: IcpRubric;
  narrativeArc: string | null;
  artifacts: ArtifactSummary[];
  activationCompleted: boolean;
}

export function IcpDashboardClient({
  initialRubric,
  narrativeArc,
  artifacts,
  activationCompleted,
}: IcpDashboardClientProps) {
  const [rubric, setRubric] = useState<IcpRubric>(initialRubric);
  const [activeView, setActiveView] = useState<"rubric" | "narrative">(
    "rubric",
  );
  const [, startTransition] = useTransition();

  // Every commit fires a full-rubric upsert. The server preserves evidence
  // metadata from the existing rubric because dashboard fields edit values only.
  function persist(next: IcpRubric) {
    setRubric(next);
    startTransition(async () => {
      const result = await updateIcpRubricAction(next);
      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-12">
      <div className="sticky top-0 z-20 -mx-6 mb-8 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-6 py-4 backdrop-blur">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Your ICP</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Synthesized from your exemplars, buyer personas, and product
              context. Click any field to refine.
            </p>
          </div>
          <Link
            href={REFRESH_HREF}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowsClockwise size={14} />
            Refresh ICP
          </Link>
        </header>

        <div className="mt-5 inline-flex rounded-lg bg-[var(--color-surface-muted)] p-1">
          <button
            type="button"
            onClick={() => setActiveView("rubric")}
            className={viewButtonClass(activeView === "rubric")}
          >
            Rubric
          </button>
          <button
            type="button"
            onClick={() => setActiveView("narrative")}
            className={viewButtonClass(activeView === "narrative")}
          >
            Narrative
          </button>
        </div>
      </div>

      {activeView === "rubric" ? (
        <IcpDashboardFields
          rubric={rubric}
          onRubricChange={persist}
          artifacts={artifacts}
        />
      ) : (
        <IcpNarrativePanel
          // Remount when a generated narrative first arrives so parsed local state refreshes.
          key={narrativeArc ?? "empty-narrative"}
          narrativeArc={narrativeArc}
        />
      )}

      <div className="mt-10 pt-6 border-t border-[var(--color-border-strong)] flex justify-end">
        <Link
          href={activationCompleted ? "/accounts" : "/activate"}
          className={buttonVariants()}
        >
          {activationCompleted ? "View Accounts" : "Find my accounts"}
        </Link>
      </div>
    </div>
  );
}

function viewButtonClass(isActive: boolean): string {
  return [
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
  ].join(" ");
}
