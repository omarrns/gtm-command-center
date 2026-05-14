"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  StreamingDocumentReader,
  type DocumentSection,
} from "@/components/ui/streaming-document-reader";
import {
  icpNarrativeArcSchema,
  type IcpNarrativeArc,
} from "@/lib/onboarding/icp-narrative-schema";
import { confirmInterviewAction } from "../interview-actions";
import { backToReviewFromStoryAction } from "../story-actions";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";

const SECTIONS: readonly DocumentSection[] = [
  { key: "trigger", title: "Trigger", kind: "text" },
  {
    key: "failed_workarounds",
    title: "Failed Workarounds",
    kind: "list",
  },
  { key: "stakes", title: "Stakes", kind: "text" },
  { key: "aha", title: "Aha", kind: "list" },
  {
    key: "decision_criteria",
    title: "Decision Criteria",
    kind: "list",
  },
  { key: "identity_shift", title: "Identity Shift", kind: "text" },
];

const CYCLIC_MESSAGES = [
  "Reading exemplars…",
  "Spotting buyer patterns…",
  "Drafting the arc…",
  "Looking for the trigger…",
];

interface IcpNarrativeReaderProps {
  interviewId: string;
  reviewEdits: IcpEdits;
  isRefresh: boolean;
  initialArc: IcpNarrativeArc | null;
}

export function IcpNarrativeReader({
  interviewId,
  reviewEdits,
  isRefresh,
  initialArc,
}: IcpNarrativeReaderProps) {
  const router = useRouter();

  async function handleSave(
    value: IcpNarrativeArc,
    dirtyKeys: ReadonlySet<keyof IcpNarrativeArc>,
  ) {
    const editedArc = dirtyKeys.size > 0 ? value : undefined;
    const result = await confirmInterviewAction(
      interviewId,
      reviewEdits,
      editedArc,
    );
    if (!result.ok) {
      throw new Error(result.error ?? "Save failed");
    }
    toast.success("Buyer arc saved!");
    router.push(isRefresh ? "/settings" : "/gtm/icp");
  }

  async function handleBack() {
    const result = await backToReviewFromStoryAction(interviewId);
    if (!result.ok) {
      throw new Error(result.error ?? "Failed to return to review");
    }
    router.refresh();
  }

  return (
    <StreamingDocumentReader<IcpNarrativeArc>
      endpoint="/api/onboard/story/stream"
      submitBody={{ interviewId }}
      schema={icpNarrativeArcSchema}
      sections={SECTIONS}
      initialValue={initialArc}
      headerTitle="Your buyer's story"
      headerSubtitleStreaming="Reading exemplars, building the arc."
      headerSubtitleReady="Click any section to edit. Save when it sounds right."
      cyclicMessages={CYCLIC_MESSAGES}
      saveLabel="Save & finish"
      backLabel="Back to review"
      onSave={handleSave}
      onBack={handleBack}
    />
  );
}
