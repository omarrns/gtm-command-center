"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowsClockwise } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import type {
  IcpAgentEventRow,
  IcpRevisionCandidateRow,
  IcpRevisionCommitRow,
} from "@/lib/icp-agent/types";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { updateIcpRubricAction } from "../../_actions/update-icp-rubric";
import {
  IcpDashboardFields,
  type ArtifactSummary,
} from "./icp-dashboard-fields";
import { IcpChangesPanel } from "./icp-changes-panel";
import { IcpChatPanel } from "./icp-chat-panel";
import { IcpNarrativePanel } from "./icp-narrative-panel";

const REFRESH_HREF = "/gtm/icp?mode=refresh";
type IcpView = "chat" | "rubric" | "narrative" | "changes";

interface IcpDashboardClientProps {
  initialRubric: IcpRubric;
  narrativeArc: string | null;
  artifacts: ArtifactSummary[];
  activationCompleted: boolean;
  commits: IcpRevisionCommitRow[];
  rejectedCandidates: IcpRevisionCandidateRow[];
  events: IcpAgentEventRow[];
  initialView: IcpView;
}

export function IcpDashboardClient({
  initialRubric,
  narrativeArc,
  artifacts,
  activationCompleted,
  commits,
  rejectedCandidates,
  events,
  initialView,
}: IcpDashboardClientProps) {
  const [rubric, setRubric] = useState<IcpRubric>(initialRubric);
  const [activeView, setActiveView] = useState<IcpView>(initialView);
  const [hasOpenedChat, setHasOpenedChat] = useState(initialView === "chat");
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

  function selectView(view: IcpView) {
    if (view === "chat") {
      setHasOpenedChat(true);
    }
    setActiveView(view);
  }

  const isChatView = activeView === "chat";

  return (
    <div
      className={
        isChatView
          ? "mx-auto flex h-[calc(100dvh-6.5rem)] max-w-3xl flex-col px-6 md:h-[calc(100dvh-8.5rem)]"
          : "mx-auto max-w-3xl px-6 pb-12"
      }
    >
      <div
        className={[
          "-mx-6 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-6 py-4 backdrop-blur",
          isChatView ? "shrink-0" : "sticky top-0 z-20 mb-8",
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Your ICP</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Chat with your ICP first. Go deeper into the rubric, narrative,
              or agent change history when you need the source material.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href={REFRESH_HREF}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowsClockwise size={14} />
              Refresh ICP
            </Link>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex rounded-lg bg-[var(--color-surface-muted)] p-1">
            <button
              type="button"
              onClick={() => selectView("chat")}
              className={viewButtonClass(activeView === "chat")}
            >
              Chat with ICP
            </button>
            <button
              type="button"
              onClick={() => selectView("rubric")}
              className={viewButtonClass(activeView === "rubric")}
            >
              Rubric
            </button>
            <button
              type="button"
              onClick={() => selectView("narrative")}
              className={viewButtonClass(activeView === "narrative")}
            >
              Narrative
            </button>
            <button
              type="button"
              onClick={() => selectView("changes")}
              className={viewButtonClass(activeView === "changes")}
            >
              Changes
            </button>
          </div>
          <Link
            href={activationCompleted ? "/gtm/accounts" : "/gtm/activate"}
            className={buttonVariants()}
          >
            {activationCompleted ? "View Accounts" : "Find My Accounts"}
          </Link>
        </div>
      </div>

      <div className={isChatView ? "min-h-0 flex-1" : undefined}>
        {hasOpenedChat ? (
          <div className={isChatView ? "h-full min-h-0" : "hidden"}>
            <IcpChatPanel />
          </div>
        ) : null}
        {!isChatView && activeView === "rubric" ? (
          <IcpDashboardFields
            rubric={rubric}
            onRubricChange={persist}
            artifacts={artifacts}
          />
        ) : !isChatView && activeView === "narrative" ? (
          <IcpNarrativePanel
            // Remount when a generated narrative first arrives so parsed local state refreshes.
            key={narrativeArc ?? "empty-narrative"}
            narrativeArc={narrativeArc}
          />
        ) : !isChatView ? (
          <IcpChangesPanel
            commits={commits}
            rejectedCandidates={rejectedCandidates}
            events={events}
          />
        ) : null}
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
