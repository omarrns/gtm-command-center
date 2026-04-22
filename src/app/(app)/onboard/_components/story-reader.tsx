"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CyclicLoader } from "@/components/ui/cyclic-loader";
import {
  insightsSchema,
  type ExtractionInsights,
} from "@/lib/onboarding/insights-schema";
import {
  confirmInterviewAction,
  backToReviewFromStoryAction,
} from "../interview-actions";
import type { JobSearchEdits } from "@/lib/onboarding/templates/job-search";
import { StorySection } from "./story-section";

const SECTION_ORDER: Array<{
  key: keyof ExtractionInsights;
  title: string;
  kind: "text" | "list";
}> = [
  { key: "career_narrative", title: "Career Narrative", kind: "text" },
  { key: "strongest_stories", title: "Strongest Stories", kind: "list" },
  { key: "decision_drivers", title: "Decision Drivers", kind: "list" },
  {
    key: "unstated_preferences",
    title: "Unstated Preferences",
    kind: "list",
  },
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

const EMPTY_INSIGHTS: ExtractionInsights = {
  career_narrative: "",
  decision_drivers: [],
  unstated_preferences: [],
  strongest_stories: [],
  positioning_alternatives: [],
  risk_tolerance: "",
  communication_style_notes: "",
};

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
  const [isPending, startTransition] = useTransition();

  // Edits made on the story screen, by field key. Set when the user
  // commits a section's textarea on blur. Drives whether confirm passes
  // editedInsights through.
  const [edits, setEdits] = useState<Partial<ExtractionInsights>>({});

  const { object, submit, isLoading, error } = useObject({
    api: "/api/onboard/story/stream",
    schema: insightsSchema,
  });

  // Auto-submit on mount if we don't already have insights.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (initialInsights || submittedRef.current) return;
    submittedRef.current = true;
    submit({ interviewId });
  }, [initialInsights, interviewId, submit]);

  // Display logic: prefer user's local edit, then live stream, then
  // persisted insights (the row was hydrated server-side after the prior
  // stream's onFinish).
  function valueFor<K extends keyof ExtractionInsights>(
    key: K,
  ): ExtractionInsights[K] {
    const edited = edits[key];
    if (edited !== undefined) return edited as ExtractionInsights[K];
    const live = object?.[key];
    if (live !== undefined && live !== null) {
      return live as ExtractionInsights[K];
    }
    if (initialInsights) return initialInsights[key];
    return EMPTY_INSIGHTS[key];
  }

  function commitText(key: keyof ExtractionInsights) {
    return (next: string) => {
      setEdits((prev) => ({ ...prev, [key]: next }));
    };
  }

  function commitList(key: keyof ExtractionInsights) {
    return (next: string[]) => {
      setEdits((prev) => ({ ...prev, [key]: next }));
    };
  }

  // A section is "ready" when the streamed object has a non-empty value
  // for it. While streaming, sections appear progressively. After the
  // stream completes (or when initialInsights was passed), all are ready.
  function isReady(key: keyof ExtractionInsights): boolean {
    if (initialInsights) return true;
    const v = object?.[key];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  const allReady =
    !isLoading && SECTION_ORDER.every(({ key }) => isReady(key)) && !error;

  function handleSaveFinish() {
    const editedInsights = buildEditedInsights(edits, valueFor);
    startTransition(async () => {
      const result = await confirmInterviewAction(
        interviewId,
        reviewEdits,
        editedInsights ?? undefined,
      );
      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
        return;
      }
      toast.success("Profile saved!");
      router.push(isRefresh ? "/settings" : "/activate");
    });
  }

  function handleBack() {
    startTransition(async () => {
      const result = await backToReviewFromStoryAction(interviewId);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to return to review");
        return;
      }
      router.refresh();
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-xl px-6 py-12"
    >
      <header className="mb-10">
        <h1 className="text-xl font-semibold tracking-tight">What I heard</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          {allReady
            ? "Click any section to edit. Save when it sounds right."
            : "Reading your interview, looking for the throughline."}
        </p>
      </header>

      {error && (
        <Alert className="mb-6">
          <AlertTriangle size={14} />
          <div className="text-xs">
            <p className="font-medium">Couldn&apos;t finish reading.</p>
            <p className="text-[var(--color-text-muted)]">
              {error.message}. Refresh to try again.
            </p>
          </div>
        </Alert>
      )}

      {SECTION_ORDER.map(({ key, title, kind }) => {
        if (!isReady(key)) return null;
        if (kind === "text") {
          return (
            <StorySection
              key={key}
              title={title}
              kind="text"
              value={valueFor(key) as string}
              onCommit={commitText(key)}
              editable={allReady}
            />
          );
        }
        return (
          <StorySection
            key={key}
            title={title}
            kind="list"
            value={valueFor(key) as string[]}
            onCommit={commitList(key)}
            editable={allReady}
          />
        );
      })}

      {!allReady && !error && (
        <div className="py-6">
          <CyclicLoader
            messages={[
              "Reading your interview…",
              "Noticing patterns…",
              "Drafting the narrative…",
              "Looking for what's unsaid…",
            ]}
          />
        </div>
      )}

      <div className="mt-12 flex items-center justify-between border-t border-[var(--color-border-strong)] pt-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={isPending}
        >
          <ArrowLeft size={14} />
          Back to review
        </Button>
        <Button
          type="button"
          onClick={handleSaveFinish}
          disabled={!allReady || isPending}
        >
          {isPending ? "Saving…" : "Save & finish"}
        </Button>
      </div>
    </motion.div>
  );
}

// Build the editedInsights payload to pass to confirm. Only set if at least
// one section was edited; otherwise undefined so confirm skips the merge.
function buildEditedInsights(
  edits: Partial<ExtractionInsights>,
  valueFor: <K extends keyof ExtractionInsights>(
    key: K,
  ) => ExtractionInsights[K],
): ExtractionInsights | null {
  const editedKeys = Object.keys(edits);
  if (editedKeys.length === 0) return null;
  return {
    career_narrative: valueFor("career_narrative"),
    decision_drivers: valueFor("decision_drivers"),
    unstated_preferences: valueFor("unstated_preferences"),
    strongest_stories: valueFor("strongest_stories"),
    positioning_alternatives: valueFor("positioning_alternatives"),
    risk_tolerance: valueFor("risk_tolerance"),
    communication_style_notes: valueFor("communication_style_notes"),
  };
}
