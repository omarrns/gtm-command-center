"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Warning } from "@phosphor-icons/react/ssr";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  confirmInterviewAction,
  backToInterviewAction,
} from "../../interview-actions";
import { startStoryPhaseAction } from "../../story-actions";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { ClientInterviewTemplate } from "@/lib/onboarding/templates/types";
import type {
  ExtractionProfile,
  ExtractionSearch,
  ExtractionOutreach,
  ExtractionInsights,
} from "@/lib/onboarding/templates/job-search";
import {
  getLowConfidenceDimensions,
  type OrchestratorState,
} from "@/lib/onboarding/orchestrator/types";
import {
  extractSection,
  extractTone,
  type OutreachTone,
} from "@/lib/onboarding/markdown";
import { ReviewSectionProfile } from "./review-section-profile";
import { ReviewSectionSearch } from "./review-section-search";
import { ReviewSectionOutreach } from "./review-section-outreach";
import { ReviewSectionInsights } from "./review-section-insights";

const SEARCH_TOPIC_KEY = "search_prefs";
const OUTREACH_TOPIC_KEY = "outreach_style";
const DEALBREAKERS_TOPIC_KEY = "dealbreakers";

interface ExistingData {
  config: {
    scoreThreshold: number;
    dailySendCap: number;
    searchQueries: string[];
    searchLocations: string[];
  } | null;
  dealbreakers: string | null;
  outreach: string | null;
}

interface ReviewJobSearchProps {
  interview: OnboardingInterviewRow;
  clientTemplate: ClientInterviewTemplate;
  isRefresh: boolean;
  onBackToInterview: (interview: OnboardingInterviewRow) => void;
  onContinueToStory: (interview: OnboardingInterviewRow) => void;
  existingData?: ExistingData;
}

export function ReviewJobSearch({
  interview,
  clientTemplate,
  isRefresh,
  onBackToInterview,
  onContinueToStory,
  existingData,
}: ReviewJobSearchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const lowConfidenceDimensions = clientTemplate.agenticMode
    ? getLowConfidenceDimensions(
        interview.orchestrator_state as OrchestratorState | null,
        clientTemplate.dimensions,
      )
    : [];

  const extracted = (interview.extracted ?? {}) as Record<string, unknown>;
  const extractedProfile = (extracted.profile ?? {}) as ExtractionProfile;
  const extractedSearch = (extracted.search ?? {}) as ExtractionSearch;
  const extractedOutreach = (extracted.outreach ?? {}) as ExtractionOutreach;
  const extractedInsights = (extracted.insights ?? {}) as ExtractionInsights;

  const saved = existingData;
  const topics = new Set(interview.topics_covered);
  const searchCovered = topics.has(SEARCH_TOPIC_KEY);
  const outreachCovered = topics.has(OUTREACH_TOPIC_KEY);
  const dealsCovered = topics.has(DEALBREAKERS_TOPIC_KEY);

  const [positioning, setPositioning] = useState(
    extractedProfile.positioning ?? "",
  );
  const [careerHighlights, setCareerHighlights] = useState(
    extractedProfile.careerHighlights ?? "",
  );
  const [proofPoints, setProofPoints] = useState(
    extractedProfile.proofPoints ?? "",
  );
  const [technicalTools, setTechnicalTools] = useState(
    extractedProfile.technicalTools ?? "",
  );

  const [searchQueries, setSearchQueries] = useState<string[]>(
    searchCovered
      ? extractedSearch.searchQueries
      : (saved?.config?.searchQueries ??
          extractedSearch.searchQueries ?? ["Software Engineer"]),
  );
  const [searchLocations, setSearchLocations] = useState<string[]>(
    searchCovered
      ? extractedSearch.searchLocations
      : (saved?.config?.searchLocations ??
          extractedSearch.searchLocations ?? ["Remote"]),
  );
  const [scoreThreshold, setScoreThreshold] = useState(
    searchCovered
      ? (extractedSearch.scoreThreshold ?? 70)
      : (saved?.config?.scoreThreshold ?? extractedSearch.scoreThreshold ?? 70),
  );
  const [dailySendCap, setDailySendCap] = useState(
    searchCovered
      ? (extractedSearch.dailySendCap ?? 10)
      : (saved?.config?.dailySendCap ?? extractedSearch.dailySendCap ?? 10),
  );

  const [greenFlags, setGreenFlags] = useState(
    dealsCovered
      ? (extractedOutreach.greenFlags ?? "")
      : extractSection(saved?.dealbreakers, "Green Flags") ||
          extractedOutreach.greenFlags ||
          "",
  );
  const [redFlags, setRedFlags] = useState(
    dealsCovered
      ? (extractedOutreach.redFlags ?? "")
      : extractSection(saved?.dealbreakers, "Red Flags") ||
          extractedOutreach.redFlags ||
          "",
  );
  const [outreachTone, setOutreachTone] = useState<OutreachTone>(
    outreachCovered
      ? (extractedOutreach.outreachTone ?? "casual")
      : (extractTone(saved?.outreach) ??
          extractedOutreach.outreachTone ??
          "casual"),
  );
  const [whatsWorked, setWhatsWorked] = useState(
    outreachCovered
      ? (extractedOutreach.whatsWorked ?? "")
      : extractSection(saved?.outreach, "What's Worked") ||
          extractedOutreach.whatsWorked ||
          "",
  );
  const [whatToAvoid, setWhatToAvoid] = useState(
    outreachCovered
      ? (extractedOutreach.whatToAvoid ?? "")
      : extractSection(saved?.outreach, "What to Avoid") ||
          extractedOutreach.whatToAvoid ||
          "",
  );

  function buildEdits() {
    return {
      profile: { positioning, careerHighlights, proofPoints, technicalTools },
      search: { searchQueries, searchLocations, scoreThreshold, dailySendCap },
      outreach: {
        greenFlags,
        redFlags,
        outreachTone,
        whatsWorked,
        whatToAvoid,
      },
    };
  }

  function handlePrimary() {
    if (clientTemplate.agenticMode) {
      startTransition(async () => {
        const result = await startStoryPhaseAction(interview.id, buildEdits());
        if (!result.ok) {
          toast.error(result.error ?? "Couldn't start story phase");
          return;
        }
        onContinueToStory(result.interview);
      });
      return;
    }

    startTransition(async () => {
      const result = await confirmInterviewAction(interview.id, buildEdits());
      if (!result.ok) {
        toast.error(result.error ?? "Confirmation failed");
        return;
      }
      toast.success("Profile saved!");
      router.push(isRefresh ? "/settings" : "/activate");
    });
  }

  function handleBack() {
    startTransition(async () => {
      const result = await backToInterviewAction(interview.id);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to resume interview");
        return;
      }
      onBackToInterview({
        ...interview,
        status: "in_progress",
        ready_for_extraction: false,
      });
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl px-6 pb-12"
    >
      <header className="sticky top-0 z-20 -mx-6 mb-8 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-6 py-4 backdrop-blur">
        <div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Review your profile
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Here&apos;s what we captured from the interview. Click any field
              to edit, then confirm.
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={isPending}
            >
              <ArrowLeft size={14} />
              Back to interview
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePrimary}
              disabled={isPending}
            >
              {isPending
                ? clientTemplate.agenticMode
                  ? "Continuing..."
                  : "Saving..."
                : clientTemplate.agenticMode
                  ? "Continue to story"
                  : "Confirm & Continue"}
            </Button>
          </div>
        </div>
      </header>

      {lowConfidenceDimensions.length > 0 && (
        <Alert className="mb-8">
          <Warning size={14} />
          <div className="text-xs space-y-1">
            <p className="font-medium">
              Double-check these — the agent wasn&apos;t sure.
            </p>
            <p className="text-[var(--color-text-muted)]">
              {lowConfidenceDimensions.map((d) => d.label).join(", ")}
            </p>
          </div>
        </Alert>
      )}

      <ReviewSectionProfile
        positioning={positioning}
        onPositioningChange={setPositioning}
        careerHighlights={careerHighlights}
        onCareerHighlightsChange={setCareerHighlights}
        proofPoints={proofPoints}
        onProofPointsChange={setProofPoints}
        technicalTools={technicalTools}
        onTechnicalToolsChange={setTechnicalTools}
      />

      <ReviewSectionSearch
        searchQueries={searchQueries}
        onSearchQueriesChange={setSearchQueries}
        searchLocations={searchLocations}
        onSearchLocationsChange={setSearchLocations}
        scoreThreshold={scoreThreshold}
        onScoreThresholdChange={setScoreThreshold}
        dailySendCap={dailySendCap}
        onDailySendCapChange={setDailySendCap}
      />

      <ReviewSectionOutreach
        greenFlags={greenFlags}
        onGreenFlagsChange={setGreenFlags}
        redFlags={redFlags}
        onRedFlagsChange={setRedFlags}
        outreachTone={outreachTone}
        onOutreachToneChange={setOutreachTone}
        whatsWorked={whatsWorked}
        onWhatsWorkedChange={setWhatsWorked}
        whatToAvoid={whatToAvoid}
        onWhatToAvoidChange={setWhatToAvoid}
      />

      <ReviewSectionInsights insights={extractedInsights} />

      <div className="mt-12 border-t border-[var(--color-border-strong)]" />
    </motion.div>
  );
}
