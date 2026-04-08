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
  X,
  Plus,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveProfileAction,
  saveSearchConfigAction,
  saveOutreachAction,
} from "../actions";

// ── Types ──

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

type OutreachTone = "casual" | "direct" | "formal";

const STEPS = [
  { label: "About You", icon: User },
  { label: "Search Prefs", icon: Search },
  { label: "Outreach", icon: MessageSquare },
  { label: "Gmail", icon: Mail },
] as const;

// ── Markdown section parser ──

function extractSection(content: string | null, heading: string): string {
  if (!content) return "";
  const regex = new RegExp(
    `## ${heading}\\s*\\n\\n([\\s\\S]*?)(?=\\n---\\n|$)`,
  );
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractTone(content: string | null): OutreachTone {
  if (!content) return "casual";
  if (content.includes("Direct")) return "direct";
  if (content.includes("Formal")) return "formal";
  return "casual";
}

// ── Component ──

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

  // Determine starting step: deep-link param > first incomplete step
  const firstIncomplete =
    [1, 2, 3, 4].find((s) => !completedSteps.includes(s)) ?? 1;
  const [step, setStep] = useState(initialStep ?? firstIncomplete);
  const [saved, setSaved] = useState<Set<number>>(new Set(completedSteps));
  const [isPending, startTransition] = useTransition();

  // ── Step 1 state ──
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

  // ── Step 2 state ──
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
  const [queryInput, setQueryInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  // ── Step 3 state ──
  const [greenFlags, setGreenFlags] = useState(
    extractSection(existingDealbreakers, "Green Flags"),
  );
  const [redFlags, setRedFlags] = useState(
    extractSection(existingDealbreakers, "Red Flags"),
  );
  const [outreachTone, setOutreachTone] = useState<OutreachTone>(
    extractTone(existingOutreach),
  );
  const [whatsWorked, setWhatsWorked] = useState(
    extractSection(existingOutreach, "What's Worked"),
  );
  const [whatToAvoid, setWhatToAvoid] = useState(
    extractSection(existingOutreach, "What to Avoid"),
  );

  // ── Tag helpers (reused from Settings) ──

  function addQuery() {
    const trimmed = queryInput.trim();
    if (!trimmed) return;
    if (trimmed.length > 100) {
      toast.error("Query must be 100 characters or less");
      return;
    }
    if (searchQueries.length >= 10) {
      toast.error("Maximum 10 search queries");
      return;
    }
    if (searchQueries.includes(trimmed)) {
      toast.error("Duplicate query");
      return;
    }
    setSearchQueries([...searchQueries, trimmed]);
    setQueryInput("");
  }

  function addLocation() {
    const trimmed = locationInput.trim();
    if (!trimmed) return;
    if (trimmed.length > 100) {
      toast.error("Location must be 100 characters or less");
      return;
    }
    if (searchLocations.length >= 10) {
      toast.error("Maximum 10 search locations");
      return;
    }
    if (searchLocations.includes(trimmed)) {
      toast.error("Duplicate location");
      return;
    }
    setSearchLocations([...searchLocations, trimmed]);
    setLocationInput("");
  }

  // ── Save + navigate ──

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
        // Step 4 — just finish
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

  // ── Step indicator ──

  function renderStepIndicator() {
    return (
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
    );
  }

  // ── Step 1: About You ──

  function renderStep1() {
    return (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="positioning" className="text-sm font-medium">
            Positioning Statement
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            One line: &quot;I&apos;m a ___ who ___&quot;
          </p>
          <input
            id="positioning"
            type="text"
            value={positioning}
            onChange={(e) => setPositioning(e.target.value)}
            placeholder={
              'e.g. "I\'m a GTM Engineer who builds pipeline through data, APIs, and automation"'
            }
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="highlights" className="text-sm font-medium">
            Career Highlights
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            3-5 bullets with metrics, reverse chronological
          </p>
          <textarea
            id="highlights"
            rows={5}
            value={careerHighlights}
            onChange={(e) => setCareerHighlights(e.target.value)}
            placeholder={
              "- Built Compass at Inkeep: 400K+ impressions, 50+ enterprise leads\n- Grew Mira Migo to 3K users, $6K MRR peak\n- 500 Global: automated 500+ investor updates/month with GPT-4"
            }
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="proof-points" className="text-sm font-medium">
            Top Proof Points
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            3 hero accomplishments used in email drafts
          </p>
          <textarea
            id="proof-points"
            rows={4}
            value={proofPoints}
            onChange={(e) => setProofPoints(e.target.value)}
            placeholder={
              "- Closed-loop GTM platform: Gong calls → AI extraction → content → attribution\n- Built and sold Compresso in 1 week to a YC startup\n- 100x GEO growth through repeatable experimentation"
            }
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tools" className="text-sm font-medium">
            Technical Tools
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Comma-separated tools and platforms you use
          </p>
          <input
            id="tools"
            type="text"
            value={technicalTools}
            onChange={(e) => setTechnicalTools(e.target.value)}
            placeholder="Claude SDK, Node.js, TypeScript, PostHog, n8n, Vercel"
            className="input"
          />
        </div>
      </div>
    );
  }

  // ── Step 2: Search Preferences ──

  function renderStep2() {
    return (
      <div className="space-y-5">
        {/* Search Queries — tag input reused from Settings */}
        <div className="space-y-1.5">
          <label htmlFor="query-input" className="text-sm font-medium">
            Search Queries
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Job titles to search for (max 10)
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {searchQueries.map((q, i) => (
              <span key={i} className="badge inline-flex items-center gap-1">
                {q}
                <button
                  type="button"
                  onClick={() =>
                    setSearchQueries(searchQueries.filter((_, j) => j !== i))
                  }
                  className="hover:text-[var(--color-danger)] transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          {searchQueries.length < 10 && (
            <div className="flex items-center gap-2">
              <input
                id="query-input"
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQuery();
                  }
                }}
                placeholder="Add a search query..."
                maxLength={100}
                className="input flex-1"
              />
              <button
                type="button"
                onClick={addQuery}
                disabled={!queryInput.trim()}
                className="btn-ghost flex items-center gap-1 text-xs"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          )}
        </div>

        {/* Search Locations — tag input */}
        <div className="space-y-1.5">
          <label htmlFor="location-input" className="text-sm font-medium">
            Search Locations
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Locations to search in (max 10)
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {searchLocations.map((loc, i) => (
              <span key={i} className="badge inline-flex items-center gap-1">
                {loc}
                <button
                  type="button"
                  onClick={() =>
                    setSearchLocations(
                      searchLocations.filter((_, j) => j !== i),
                    )
                  }
                  className="hover:text-[var(--color-danger)] transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          {searchLocations.length < 10 && (
            <div className="flex items-center gap-2">
              <input
                id="location-input"
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLocation();
                  }
                }}
                placeholder="Add a location..."
                maxLength={100}
                className="input flex-1"
              />
              <button
                type="button"
                onClick={addLocation}
                disabled={!locationInput.trim()}
                className="btn-ghost flex items-center gap-1 text-xs"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          )}
        </div>

        {/* Score Threshold */}
        <div className="space-y-1.5">
          <label htmlFor="score-threshold" className="text-sm font-medium">
            Score Threshold
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Minimum score for opportunities to pass scoring (0-100)
          </p>
          <input
            id="score-threshold"
            type="number"
            min={0}
            max={100}
            value={scoreThreshold}
            onChange={(e) =>
              setScoreThreshold(
                Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
              )
            }
            className="input w-28"
          />
        </div>

        {/* Daily Send Cap */}
        <div className="space-y-1.5">
          <label htmlFor="daily-send-cap" className="text-sm font-medium">
            Daily Send Cap
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Maximum emails sent per day (0-50)
          </p>
          <input
            id="daily-send-cap"
            type="number"
            min={0}
            max={50}
            value={dailySendCap}
            onChange={(e) =>
              setDailySendCap(
                Math.max(0, Math.min(50, parseInt(e.target.value) || 0)),
              )
            }
            className="input w-28"
          />
        </div>
      </div>
    );
  }

  // ── Step 3: Outreach & Preferences ──

  function renderStep3() {
    return (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="green-flags" className="text-sm font-medium">
            Green Flags
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            What makes a company worth pursuing?
          </p>
          <textarea
            id="green-flags"
            rows={3}
            value={greenFlags}
            onChange={(e) => setGreenFlags(e.target.value)}
            placeholder={
              "Series A-C, product-led growth, small GTM team, technical founders"
            }
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="red-flags" className="text-sm font-medium">
            Red Flags
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Immediate disqualifiers
          </p>
          <textarea
            id="red-flags"
            rows={3}
            value={redFlags}
            onChange={(e) => setRedFlags(e.target.value)}
            placeholder={
              "Enterprise-only sales motion, no product yet, agency/consultancy"
            }
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Outreach Tone</label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            How should your emails sound?
          </p>
          <div className="flex gap-2">
            {(["casual", "direct", "formal"] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => setOutreachTone(tone)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  outreachTone === tone
                    ? "bg-[var(--color-blue)] text-white"
                    : "bg-[var(--muted)] text-[var(--color-text-muted)] hover:bg-[var(--accent)]"
                }`}
              >
                {tone.charAt(0).toUpperCase() + tone.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="whats-worked" className="text-sm font-medium">
            What&apos;s Worked
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Validated patterns, subject lines, framing that got replies
          </p>
          <textarea
            id="whats-worked"
            rows={3}
            value={whatsWorked}
            onChange={(e) => setWhatsWorked(e.target.value)}
            placeholder={
              "Peer frame over applicant frame, simple binary asks, no research mirror-backs"
            }
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="what-to-avoid" className="text-sm font-medium">
            What to Avoid
          </label>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Anti-patterns, things that bombed
          </p>
          <textarea
            id="what-to-avoid"
            rows={3}
            value={whatToAvoid}
            onChange={(e) => setWhatToAvoid(e.target.value)}
            placeholder={
              "Long intros, flattery, bullet-heavy emails, 'I noticed you...' openers"
            }
            className="input"
          />
        </div>
      </div>
    );
  }

  // ── Step 4: Gmail ──

  function renderStep4() {
    return (
      <div className="space-y-5">
        <div className="surface p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Mail size={16} />
            <h3 className="text-sm font-semibold">Gmail Integration</h3>
          </div>

          {gmailConnected ? (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)]" />
              <span className="text-sm">Gmail connected</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                Connect your Gmail account to send approved outreach emails
                directly from the pipeline. You can also do this later from
                Settings.
              </p>
              <a
                href={`/api/auth/gmail?return_to=${encodeURIComponent(`/onboard?step=4${isRefresh ? "&mode=refresh" : ""}`)}`}
                className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2"
              >
                <ExternalLink size={13} />
                Connect Gmail
              </a>
            </div>
          )}
        </div>

        <p className="text-xs text-[var(--color-text-subtle)]">
          Gmail is optional. The pipeline can discover, score, and draft emails
          without it. You can connect later from Settings.
        </p>
      </div>
    );
  }

  // ── Render ──

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

  // In refresh mode, redirect back to Settings instead of Today
  const completionUrl = isRefresh ? "/settings" : "/";

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

      {renderStepIndicator()}

      <div className="surface p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold">{stepTitles[step - 1]}</h2>
          <p className="text-xs text-[var(--color-text-subtle)] mt-1">
            {stepDescriptions[step - 1]}
          </p>
        </div>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border)]">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              className="btn-ghost flex items-center gap-1 text-sm"
            >
              <ChevronLeft size={14} />
              Back
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={saveAndNext}
            disabled={isPending}
            className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2"
          >
            {isPending ? (
              "Saving..."
            ) : (
              <>
                {nextLabel}
                {!isLastStep && <ChevronRight size={14} />}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
