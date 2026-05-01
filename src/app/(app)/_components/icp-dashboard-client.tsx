"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowsClockwise as RefreshCw,
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
    <div className="mx-auto max-w-xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your ICP</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">
            Synthesized from your exemplars, buyer personas, and product
            context. Click any field to refine.
          </p>
        </div>
        <Link
          href={REFRESH_HREF}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <RefreshCw size={14} />
          Refresh ICP
        </Link>
      </header>

      <div className="mb-8 inline-flex rounded-lg bg-muted p-1">
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

      {activeView === "rubric" ? (
        <IcpDashboardFields
          rubric={rubric}
          onRubricChange={persist}
          artifacts={artifacts}
        />
      ) : (
        <IcpNarrativePanel
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
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}
