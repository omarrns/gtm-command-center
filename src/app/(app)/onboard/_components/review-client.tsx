"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  confirmInterviewAction,
  backToInterviewAction,
} from "../interview-actions";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type {
  ExtractionProfile,
  ExtractionSearch,
  ExtractionOutreach,
  ExtractionInsights,
} from "@/lib/onboarding/extraction";
import {
  type OutreachTone,
  extractSectionFromMarkdown,
  inferToneFromMarkdown,
} from "./review-helpers";

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
  isRefresh: boolean;
  onBackToInterview: (interview: OnboardingInterviewRow) => void;
  /** Existing saved data — used as fallback in refresh mode */
  existingData?: ExistingData;
}

export function ReviewClient({
  interview,
  isRefresh,
  onBackToInterview,
  existingData,
}: ReviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const extractedProfile = (interview.extracted_profile ??
    {}) as unknown as ExtractionProfile;
  const extractedSearch = (interview.extracted_search ??
    {}) as unknown as ExtractionSearch;
  const extractedOutreach = (interview.extracted_outreach ??
    {}) as unknown as ExtractionOutreach;
  const extractedInsights = (interview.extracted_insights ??
    {}) as unknown as ExtractionInsights;

  // In refresh mode, use topics_covered to decide whether to trust
  // extracted values. If a topic wasn't covered in the interview, the
  // extractor returns defaults that would clobber existing saved data.
  const saved = existingData;
  const topics = new Set(interview.topics_covered);
  const searchCovered = topics.has("search_prefs");
  const outreachCovered = topics.has("outreach_style");
  const dealsCovered = topics.has("dealbreakers");

  // ── Editable state ──
  // Profile fields: always trust extraction (identity/career are always covered)
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

  // Search fields: only trust extraction if search_prefs was covered,
  // otherwise preserve existing saved config
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
  const [queryInput, setQueryInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  // Outreach/dealbreaker fields: only trust extraction if the topic was covered
  const [greenFlags, setGreenFlags] = useState(
    dealsCovered
      ? (extractedOutreach.greenFlags ?? "")
      : extractSectionFromMarkdown(saved?.dealbreakers, "Green Flags") ||
          extractedOutreach.greenFlags ||
          "",
  );
  const [redFlags, setRedFlags] = useState(
    dealsCovered
      ? (extractedOutreach.redFlags ?? "")
      : extractSectionFromMarkdown(saved?.dealbreakers, "Red Flags") ||
          extractedOutreach.redFlags ||
          "",
  );
  const [outreachTone, setOutreachTone] = useState<OutreachTone>(
    outreachCovered
      ? (extractedOutreach.outreachTone ?? "casual")
      : (inferToneFromMarkdown(saved?.outreach) ??
          extractedOutreach.outreachTone ??
          "casual"),
  );
  const [whatsWorked, setWhatsWorked] = useState(
    outreachCovered
      ? (extractedOutreach.whatsWorked ?? "")
      : extractSectionFromMarkdown(saved?.outreach, "What's Worked") ||
          extractedOutreach.whatsWorked ||
          "",
  );
  const [whatToAvoid, setWhatToAvoid] = useState(
    outreachCovered
      ? (extractedOutreach.whatToAvoid ?? "")
      : extractSectionFromMarkdown(saved?.outreach, "What to Avoid") ||
          extractedOutreach.whatToAvoid ||
          "",
  );

  // ── Section collapse state ──
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

  // ── Tag helpers ──
  function addQuery() {
    const trimmed = queryInput.trim();
    if (!trimmed || trimmed.length > 100 || searchQueries.length >= 10) return;
    if (searchQueries.includes(trimmed)) return;
    setSearchQueries([...searchQueries, trimmed]);
    setQueryInput("");
  }

  function addLocation() {
    const trimmed = locationInput.trim();
    if (!trimmed || trimmed.length > 100 || searchLocations.length >= 10)
      return;
    if (searchLocations.includes(trimmed)) return;
    setSearchLocations([...searchLocations, trimmed]);
    setLocationInput("");
  }

  // ── Confirm ──
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

      // Refresh mode → back to settings. First-time → activation search.
      if (isRefresh) {
        router.push("/settings");
      } else {
        router.push("/activate");
      }
    });
  }

  // ── Back to interview ──
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

  function renderSectionHeader(id: string, title: string) {
    const isExpanded = expandedSections.has(id);
    return (
      <button
        type="button"
        onClick={() => toggleSection(id)}
        className="flex items-center justify-between w-full py-2"
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        {isExpanded ? (
          <ChevronUp size={14} className="text-[var(--color-text-subtle)]" />
        ) : (
          <ChevronDown size={14} className="text-[var(--color-text-subtle)]" />
        )}
      </button>
    );
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

      {/* Profile Section */}
      <div className="surface p-5 mb-4">
        {renderSectionHeader("profile", "Profile")}
        {expandedSections.has("profile") && (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Positioning</label>
              <input
                type="text"
                value={positioning}
                onChange={(e) => setPositioning(e.target.value)}
                className="input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Career Highlights</label>
              <textarea
                rows={4}
                value={careerHighlights}
                onChange={(e) => setCareerHighlights(e.target.value)}
                className="input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Proof Points</label>
              <textarea
                rows={3}
                value={proofPoints}
                onChange={(e) => setProofPoints(e.target.value)}
                className="input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Technical Tools</label>
              <input
                type="text"
                value={technicalTools}
                onChange={(e) => setTechnicalTools(e.target.value)}
                className="input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Search Section */}
      <div className="surface p-5 mb-4">
        {renderSectionHeader("search", "Search Preferences")}
        {expandedSections.has("search") && (
          <div className="space-y-4 mt-2">
            {/* Search Queries */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Search Queries</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {searchQueries.map((q, i) => (
                  <span
                    key={i}
                    className="badge inline-flex items-center gap-1"
                  >
                    {q}
                    <button
                      type="button"
                      onClick={() =>
                        setSearchQueries(
                          searchQueries.filter((_, j) => j !== i),
                        )
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

            {/* Search Locations */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Locations</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {searchLocations.map((loc, i) => (
                  <span
                    key={i}
                    className="badge inline-flex items-center gap-1"
                  >
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Score Threshold</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreThreshold}
                  onChange={(e) =>
                    setScoreThreshold(
                      Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                    )
                  }
                  className="input w-24"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Daily Send Cap</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={dailySendCap}
                  onChange={(e) =>
                    setDailySendCap(
                      Math.max(0, Math.min(50, parseInt(e.target.value) || 0)),
                    )
                  }
                  className="input w-24"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Outreach Section */}
      <div className="surface p-5 mb-4">
        {renderSectionHeader("outreach", "Outreach")}
        {expandedSections.has("outreach") && (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Green Flags</label>
              <textarea
                rows={3}
                value={greenFlags}
                onChange={(e) => setGreenFlags(e.target.value)}
                className="input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Red Flags</label>
              <textarea
                rows={3}
                value={redFlags}
                onChange={(e) => setRedFlags(e.target.value)}
                className="input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Outreach Tone</label>
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
              <label className="text-sm font-medium">What&apos;s Worked</label>
              <textarea
                rows={2}
                value={whatsWorked}
                onChange={(e) => setWhatsWorked(e.target.value)}
                className="input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">What to Avoid</label>
              <textarea
                rows={2}
                value={whatToAvoid}
                onChange={(e) => setWhatToAvoid(e.target.value)}
                className="input"
              />
            </div>
          </div>
        )}
      </div>

      {/* Coach Notes (read-only) */}
      {extractedInsights.career_narrative && (
        <div className="surface p-5 mb-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={14} className="text-[var(--color-blue)]" />
            <h3 className="text-sm font-semibold">Coach Notes</h3>
          </div>
          <div className="space-y-3 text-sm text-[var(--color-text-muted)]">
            {extractedInsights.career_narrative && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text)] mb-1">
                  Career Narrative
                </p>
                <p>{extractedInsights.career_narrative}</p>
              </div>
            )}
            {extractedInsights.strongest_stories?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text)] mb-1">
                  Strongest Stories
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {extractedInsights.strongest_stories.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {extractedInsights.decision_drivers?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text)] mb-1">
                  Decision Drivers
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {extractedInsights.decision_drivers.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {extractedInsights.communication_style_notes && (
              <div>
                <p className="text-xs font-medium text-[var(--color-text)] mb-1">
                  Communication Style
                </p>
                <p>{extractedInsights.communication_style_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={isPending}
          className="btn-ghost flex items-center gap-1 text-sm"
        >
          <ArrowLeft size={14} />
          Back to interview
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="btn-primary text-sm px-5 py-2"
        >
          {isPending ? "Saving..." : "Confirm & Continue"}
        </button>
      </div>
    </div>
  );
}
