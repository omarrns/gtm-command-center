"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { EditableProseSection } from "@/components/ui/editable-prose-section";
import type { IcpNarrativeArc } from "@/lib/onboarding/icp-narrative-schema";
import { parseIcpNarrativeMarkdown } from "@/lib/onboarding/templates/icp-definition/narrative-formatter";
import { updateIcpNarrativeArcAction } from "../_actions/update-icp-narrative";
import { GenerateIcpNarrativeButton } from "./generate-icp-narrative-button";

const REFRESH_HREF = "/onboard?mode=refresh&template=icp_definition";

interface IcpNarrativePanelProps {
  narrativeArc: string | null;
}

type TextKey = "trigger" | "stakes" | "identity_shift";
type ListKey = "failed_workarounds" | "aha" | "decision_criteria";

export function IcpNarrativePanel({ narrativeArc }: IcpNarrativePanelProps) {
  const [arc, setArc] = useState(() => parseIcpNarrativeMarkdown(narrativeArc));
  const [, startTransition] = useTransition();

  function persist(next: IcpNarrativeArc) {
    setArc(next);
    startTransition(async () => {
      const result = await updateIcpNarrativeArcAction(next);
      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
      }
    });
  }

  if (!narrativeArc?.trim()) {
    return <NarrativeEmptyState />;
  }

  return (
    <>
      <NarrativeTextSection
        title="Trigger"
        value={arc.trigger}
        onCommit={(trigger) => persist({ ...arc, trigger })}
      />
      <NarrativeListSection
        title="Failed Workarounds"
        value={arc.failed_workarounds}
        onCommit={(failed_workarounds) =>
          persist({ ...arc, failed_workarounds })
        }
      />
      <NarrativeTextSection
        title="Stakes"
        value={arc.stakes}
        onCommit={(stakes) => persist({ ...arc, stakes })}
      />
      <NarrativeListSection
        title="Aha"
        value={arc.aha}
        onCommit={(aha) => persist({ ...arc, aha })}
      />
      <NarrativeListSection
        title="Decision Criteria"
        value={arc.decision_criteria}
        onCommit={(decision_criteria) =>
          persist({ ...arc, decision_criteria })
        }
      />
      <NarrativeTextSection
        title="Identity Shift"
        value={arc.identity_shift}
        onCommit={(identity_shift) => persist({ ...arc, identity_shift })}
      />
    </>
  );
}

function NarrativeEmptyState() {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Narrative Arc
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
        Your ICP rubric exists, but the buyer story is missing. Generate it
        from your saved ICP so messaging and outreach can use it.
      </p>
      <div className="flex flex-wrap gap-2">
        <GenerateIcpNarrativeButton />
        <Link
          href={REFRESH_HREF}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Refresh ICP
        </Link>
      </div>
    </section>
  );
}

function NarrativeTextSection({
  title,
  value,
  onCommit,
}: {
  title: string;
  value: IcpNarrativeArc[TextKey];
  onCommit: (next: string) => void;
}) {
  return (
    <EditableProseSection
      title={title}
      kind="text"
      value={value}
      onCommit={onCommit}
      editable
    />
  );
}

function NarrativeListSection({
  title,
  value,
  onCommit,
}: {
  title: string;
  value: IcpNarrativeArc[ListKey];
  onCommit: (next: string[]) => void;
}) {
  return (
    <EditableProseSection
      title={title}
      kind="list"
      value={value}
      onCommit={onCommit}
      editable
    />
  );
}
