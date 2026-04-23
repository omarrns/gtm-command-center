"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  StreamingDocumentReader,
  type DocumentSection,
} from "@/components/ui/streaming-document-reader";
import {
  insightsSchema,
  type ExtractionInsights,
} from "@/lib/onboarding/insights-schema";
import {
  confirmInterviewAction,
  backToReviewFromStoryAction,
} from "../interview-actions";
import type { JobSearchEdits } from "@/lib/onboarding/templates/job-search";

const SECTIONS: readonly DocumentSection[] = [
  { key: "career_narrative", title: "Career Narrative", kind: "text" },
  { key: "strongest_stories", title: "Strongest Stories", kind: "list" },
  { key: "decision_drivers", title: "Decision Drivers", kind: "list" },
  { key: "unstated_preferences", title: "Unstated Preferences", kind: "list" },
  {
    key: "positioning_alternatives",
    title: "Positioning Alternatives",
    kind: "list",
  },
  { key: "risk_tolerance", title: "Risk Tolerance", kind: "text" },
  {
    key: "communication_style_notes",
    title: "Communication Style",
    kind: "text",
  },
];

const CYCLIC_MESSAGES = [
  "Reading your interview…",
  "Noticing patterns…",
  "Drafting the narrative…",
  "Looking for what's unsaid…",
];

interface StoryReaderProps {
  interviewId: string;
  reviewEdits: JobSearchEdits;
  isRefresh: boolean;
  initialInsights: ExtractionInsights | null;
}

export function StoryReader({
  interviewId,
  reviewEdits,
  isRefresh,
  initialInsights,
}: StoryReaderProps) {
  const router = useRouter();

  async function handleSave(
    value: ExtractionInsights,
    dirtyKeys: ReadonlySet<keyof ExtractionInsights>,
  ) {
    const editedInsights = dirtyKeys.size > 0 ? value : undefined;
    const result = await confirmInterviewAction(
      interviewId,
      reviewEdits,
      editedInsights,
    );
    if (!result.ok) {
      throw new Error(result.error ?? "Save failed");
    }
    toast.success("Profile saved!");
    router.push(isRefresh ? "/settings" : "/activate");
  }

  async function handleBack() {
    const result = await backToReviewFromStoryAction(interviewId);
    if (!result.ok) {
      throw new Error(result.error ?? "Failed to return to review");
    }
    router.refresh();
  }

  return (
    <StreamingDocumentReader<ExtractionInsights>
      endpoint="/api/onboard/story/stream"
      submitBody={{ interviewId }}
      schema={insightsSchema}
      sections={SECTIONS}
      initialValue={initialInsights}
      headerTitle="What I heard"
      headerSubtitleStreaming="Reading your interview, looking for the throughline."
      headerSubtitleReady="Click any section to edit. Save when it sounds right."
      cyclicMessages={CYCLIC_MESSAGES}
      saveLabel="Save & finish"
      backLabel="Back to review"
      onSave={handleSave}
      onBack={handleBack}
    />
  );
}
