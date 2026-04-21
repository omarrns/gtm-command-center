"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  confirmInterviewAction,
  backToInterviewAction,
} from "../interview-actions";
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
import { ReviewSectionProfile } from "./review-sections/review-section-profile";
import { ReviewSectionSearch } from "./review-sections/review-section-search";
import { ReviewSectionOutreach } from "./review-sections/review-section-outreach";
import { ReviewSectionInsights } from "./review-sections/review-section-insights";

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

interface ReviewClientProps {
  interview: OnboardingInterviewRow;
  clientTemplate: ClientInterviewTemplate;
  isRefresh: boolean;
  onBackToInterview: (interview: OnboardingInterviewRow) => void;
  /** Existing saved data — used as fallback in refresh mode */
  existingData?: ExistingData;
}

export function ReviewClient({
  interview,
  clientTemplate,
  isRefresh,
  onBackToInterview,
  existingData,
}: ReviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Agentic mode only: surface dimensions that hit the 2-ask cap with
  // confidence still below threshold, so the user knows which inferences
  // to double-check before confirming.
  const lowConfidenceDimensions = clientTemplate.agenticMode
    ? getLowConfidenceDimensions(
        interview.orchestrator_state as OrchestratorState | null,
        clientTemplate.dimensions,
      )
    : [];

  const extractedProfile = (interview.extracted_profile ??
    {}) as unknown as ExtractionProfile;
  const extractedSearch = (interview.extracted_search ??
    {}) as unknown as ExtractionSearch;
  const extractedOutreach = (interview.extracted_outreach ??
    {}) as unknown as ExtractionOutreach;
  const extractedInsights = (interview.extracted_insights ??
    {}) as unknown as ExtractionInsights;

  // In refresh mode, use topics_covered to decide whether to trust extracted
  // values. If a topic wasn't covered in the interview, the extractor returns
  // defaults that would clobber existing saved data.
  const saved = existingData;
  const topics = new Set(interview.topics_covered);
  const searchCovered = topics.has("search_prefs");
  const outreachCovered = topics.has("outreach_style");
  const dealsCovered = topics.has("dealbreakers");

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

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["profile", "search", "outreach"]),
  );

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmInterviewAction(interview.id, {
        profile: { positioning, careerHighlights, proofPoints, technicalTools },
        search: {
          searchQueries,
          searchLocations,
          scoreThreshold,
          dailySendCap,
        },
        outreach: {
          greenFlags,
          redFlags,
          outreachTone,
          whatsWorked,
          whatToAvoid,
        },
      });

      if (!result.ok) {
        toast.error(result.error ?? "Confirmation failed");
        return;
      }

      toast.success("Profile saved!");

      if (isRefresh) {
        router.push("/settings");
      } else {
        router.push("/activate");
      }
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
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">
          Review your profile
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Here&apos;s what we captured from the interview. Edit anything that
          doesn&apos;t look right, then confirm.
        </p>
      </div>

      {lowConfidenceDimensions.length > 0 && (
        <Alert className="mb-6">
          <AlertTriangle size={14} />
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
        isExpanded={expandedSections.has("profile")}
        onToggle={() => toggleSection("profile")}
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
        isExpanded={expandedSections.has("search")}
        onToggle={() => toggleSection("search")}
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
        isExpanded={expandedSections.has("outreach")}
        onToggle={() => toggleSection("outreach")}
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

      <div className="flex items-center justify-between">
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
        <Button type="button" onClick={handleConfirm} disabled={isPending}>
          {isPending ? "Saving..." : "Confirm & Continue"}
        </Button>
      </div>
    </div>
  );
}
