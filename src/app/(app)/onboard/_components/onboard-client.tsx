"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Search,
  MessageSquare,
  Mail,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  saveProfileAction,
  saveSearchConfigAction,
  saveOutreachAction,
} from "../actions";
import {
  extractSection,
  extractTone,
  type OutreachTone,
} from "@/lib/onboarding/markdown";
import { StepProfile } from "./steps/step-profile";
import { StepSearch } from "./steps/step-search";
import { StepOutreach } from "./steps/step-outreach";
import { StepGmail } from "./steps/step-gmail";

interface OnboardClientProps {
  completedSteps: number[];
  initialStep: number | null;
  isRefresh?: boolean;
  existingProfile: string | null;
  existingPositioning: string | null;
  existingConfig: {
    scoreThreshold: number;
    dailySendCap: number;
    searchQueries: string[];
    searchLocations: string[];
  } | null;
  existingDealbreakers: string | null;
  existingOutreach: string | null;
  gmailConnected: boolean;
}

const STEPS = [
  { label: "About You", icon: User },
  { label: "Search Prefs", icon: Search },
  { label: "Outreach", icon: MessageSquare },
  { label: "Gmail", icon: Mail },
] as const;

export function OnboardClient({
  completedSteps,
  initialStep,
  isRefresh = false,
  existingProfile,
  existingPositioning,
  existingConfig,
  existingDealbreakers,
  existingOutreach,
  gmailConnected,
}: OnboardClientProps) {
  const router = useRouter();

  const firstIncomplete =
    [1, 2, 3, 4].find((s) => !completedSteps.includes(s)) ?? 1;
  const [step, setStep] = useState(initialStep ?? firstIncomplete);
  const [saved, setSaved] = useState<Set<number>>(new Set(completedSteps));
  const [isPending, startTransition] = useTransition();

  const [positioning, setPositioning] = useState(
    extractSection(existingPositioning, "Positioning Statement") ||
      extractSection(existingProfile, "Positioning"),
  );
  const [careerHighlights, setCareerHighlights] = useState(
    extractSection(existingProfile, "Career Highlights"),
  );
  const [proofPoints, setProofPoints] = useState(
    extractSection(existingPositioning, "What Makes Me Distinct") ||
      extractSection(existingProfile, "Top Proof Points"),
  );
  const [technicalTools, setTechnicalTools] = useState(
    extractSection(existingProfile, "Technical Tools"),
  );

  const [searchQueries, setSearchQueries] = useState(
    existingConfig?.searchQueries ?? ["GTM Engineer", "Growth Engineer"],
  );
  const [searchLocations, setSearchLocations] = useState(
    existingConfig?.searchLocations ?? ["San Francisco", "New York"],
  );
  const [scoreThreshold, setScoreThreshold] = useState(
    existingConfig?.scoreThreshold ?? 70,
  );
  const [dailySendCap, setDailySendCap] = useState(
    existingConfig?.dailySendCap ?? 10,
  );

  const [greenFlags, setGreenFlags] = useState(
    extractSection(existingDealbreakers, "Green Flags"),
  );
  const [redFlags, setRedFlags] = useState(
    extractSection(existingDealbreakers, "Red Flags"),
  );
  const [outreachTone, setOutreachTone] = useState<OutreachTone>(
    extractTone(existingOutreach) ?? "casual",
  );
  const [whatsWorked, setWhatsWorked] = useState(
    extractSection(existingOutreach, "What's Worked"),
  );
  const [whatToAvoid, setWhatToAvoid] = useState(
    extractSection(existingOutreach, "What to Avoid"),
  );

  const completionUrl = isRefresh ? "/settings" : "/";

  function saveAndNext() {
    startTransition(async () => {
      let result: { ok: boolean; error?: string };

      if (step === 1) {
        result = await saveProfileAction({
          positioning,
          careerHighlights,
          proofPoints,
          technicalTools,
        });
      } else if (step === 2) {
        result = await saveSearchConfigAction({
          searchQueries,
          searchLocations,
          scoreThreshold,
          dailySendCap,
        });
      } else if (step === 3) {
        result = await saveOutreachAction({
          greenFlags,
          redFlags,
          outreachTone,
          whatsWorked,
          whatToAvoid,
        });
      } else {
        router.push(completionUrl);
        return;
      }

      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
        return;
      }

      setSaved((prev) => new Set([...prev, step]));
      toast.success(`${STEPS[step - 1].label} saved`);

      if (step < 4) {
        setStep(step + 1);
      } else {
        router.push(completionUrl);
      }
    });
  }

  function goBack() {
    if (step > 1) setStep(step - 1);
  }

  const stepTitles = [
    "Tell us about yourself",
    "Configure your search",
    "Set your outreach preferences",
    "Connect Gmail",
  ];

  const stepDescriptions = [
    "This context powers scoring accuracy and email personalization.",
    "What roles and locations should the pipeline search for?",
    "What do you look for in a company, and how do you write emails?",
    "Optional — send approved emails directly from the pipeline.",
  ];

  const isLastStep = step === 4;
  const nextLabel = isLastStep
    ? isRefresh
      ? "Save & Return to Settings"
      : "Complete Setup"
    : saved.has(step)
      ? "Update & Continue"
      : "Save & Continue";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">
          {isRefresh ? "Profile Refresh" : "Set up your pipeline"}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {isRefresh
            ? "Update your profile, search preferences, and outreach style. Changes take effect on the next pipeline run."
            : "Complete these steps so the pipeline can find, score, and draft personalized outreach for you."}
        </p>
      </div>

      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isDone = saved.has(stepNum);
          const Icon = s.icon;
          return (
            <div key={stepNum} className="flex items-center gap-1">
              {i > 0 && (
                <div
                  className={`h-px w-6 md:w-10 ${isDone || isActive ? "bg-[var(--color-blue)]" : "bg-[var(--border)]"}`}
                />
              )}
              <button
                type="button"
                onClick={() => setStep(stepNum)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--color-blue)] text-white"
                    : isDone
                      ? "bg-[var(--color-blue-muted)] text-[var(--color-blue)]"
                      : "bg-[var(--muted)] text-[var(--color-text-subtle)]"
                }`}
              >
                {isDone && !isActive ? <Check size={12} /> : <Icon size={12} />}
                <span className="hidden md:inline">{s.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="surface p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold">{stepTitles[step - 1]}</h2>
          <p className="text-xs text-[var(--color-text-subtle)] mt-1">
            {stepDescriptions[step - 1]}
          </p>
        </div>

        {step === 1 && (
          <StepProfile
            positioning={positioning}
            onPositioningChange={setPositioning}
            careerHighlights={careerHighlights}
            onCareerHighlightsChange={setCareerHighlights}
            proofPoints={proofPoints}
            onProofPointsChange={setProofPoints}
            technicalTools={technicalTools}
            onTechnicalToolsChange={setTechnicalTools}
          />
        )}
        {step === 2 && (
          <StepSearch
            searchQueries={searchQueries}
            onSearchQueriesChange={setSearchQueries}
            searchLocations={searchLocations}
            onSearchLocationsChange={setSearchLocations}
            scoreThreshold={scoreThreshold}
            onScoreThresholdChange={setScoreThreshold}
            dailySendCap={dailySendCap}
            onDailySendCapChange={setDailySendCap}
          />
        )}
        {step === 3 && (
          <StepOutreach
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
        )}
        {step === 4 && (
          <StepGmail gmailConnected={gmailConnected} isRefresh={isRefresh} />
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border)]">
          {step > 1 ? (
            <Button type="button" variant="ghost" size="sm" onClick={goBack}>
              <ChevronLeft size={14} />
              Back
            </Button>
          ) : (
            <div />
          )}

          <Button type="button" onClick={saveAndNext} disabled={isPending}>
            {isPending ? (
              "Saving..."
            ) : (
              <>
                {nextLabel}
                {!isLastStep && <ChevronRight size={14} />}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
