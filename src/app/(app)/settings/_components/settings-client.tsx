"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Mail,
  MailX,
  ExternalLink,
  X,
  Plus,
  Clock,
  Save,
  UserPen,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  disconnectGmailAction,
  updateConfigAction,
  updateScoringWeightsAction,
} from "../actions";
import type { UserScoringProfileRow } from "@/lib/supabase/types";

// ── Weight dimension labels ──

const WEIGHT_DIMENSIONS = [
  {
    key: "weight_role_fit",
    label: "Role Fit",
    desc: "Core responsibilities match",
  },
  { key: "weight_seniority", label: "Seniority", desc: "Years of experience" },
  {
    key: "weight_stage",
    label: "Company Stage",
    desc: "Stage preference match",
  },
  {
    key: "weight_domain",
    label: "Domain",
    desc: "Industry/market familiarity",
  },
  { key: "weight_stack", label: "Tech Stack", desc: "Technical requirements" },
  {
    key: "weight_proof_points",
    label: "Proof Points",
    desc: "Outcome evidence",
  },
  {
    key: "weight_dealbreaker",
    label: "Dealbreakers",
    desc: "Gap risk assessment",
  },
] as const;

type WeightKey = (typeof WEIGHT_DIMENSIONS)[number]["key"];

interface SettingsClientProps {
  gmailConnected: boolean;
  gmailAddress: string | null;
  gmailError?: string;
  scoreThreshold: number;
  dailySendCap: number;
  searchQueries: string[];
  searchLocations: string[];
  scoringProfile: UserScoringProfileRow | null;
}

export function SettingsClient({
  gmailConnected,
  gmailAddress,
  gmailError,
  scoreThreshold: initialThreshold,
  dailySendCap: initialCap,
  searchQueries: initialQueries,
  searchLocations: initialLocations,
  scoringProfile,
}: SettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isSavingWeights, startSavingWeights] = useTransition();

  // Editable state
  const [scoreThreshold, setScoreThreshold] = useState(initialThreshold);
  const [dailySendCap, setDailySendCap] = useState(initialCap);
  const [searchQueries, setSearchQueries] = useState(initialQueries);
  const [searchLocations, setSearchLocations] = useState(initialLocations);

  // Tag input state
  const [queryInput, setQueryInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  // Weight state (only when profile exists)
  const [weights, setWeights] = useState<Record<WeightKey, number>>(() => {
    if (!scoringProfile) {
      return Object.fromEntries(
        WEIGHT_DIMENSIONS.map((d) => [d.key, 1.0]),
      ) as Record<WeightKey, number>;
    }
    return Object.fromEntries(
      WEIGHT_DIMENSIONS.map((d) => [d.key, scoringProfile[d.key]]),
    ) as Record<WeightKey, number>;
  });

  const initialWeights = scoringProfile
    ? Object.fromEntries(
        WEIGHT_DIMENSIONS.map((d) => [d.key, scoringProfile[d.key]]),
      )
    : null;

  const isWeightsDirty =
    initialWeights &&
    WEIGHT_DIMENSIONS.some(
      (d) => weights[d.key] !== initialWeights[d.key as WeightKey],
    );

  // Dirty tracking
  const isDirty =
    scoreThreshold !== initialThreshold ||
    dailySendCap !== initialCap ||
    JSON.stringify(searchQueries) !== JSON.stringify(initialQueries) ||
    JSON.stringify(searchLocations) !== JSON.stringify(initialLocations);

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectGmailAction();
      if (result.ok) {
        toast.success("Gmail disconnected");
      } else {
        toast.error(result.error ?? "Failed to disconnect");
      }
    });
  }

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

  function removeQuery(index: number) {
    setSearchQueries(searchQueries.filter((_, i) => i !== index));
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

  function removeLocation(index: number) {
    setSearchLocations(searchLocations.filter((_, i) => i !== index));
  }

  function handleSave() {
    // Build partial update with only changed fields
    const updates: {
      scoreThreshold?: number;
      searchQueries?: string[];
      searchLocations?: string[];
      dailySendCap?: number;
    } = {};
    if (scoreThreshold !== initialThreshold)
      updates.scoreThreshold = scoreThreshold;
    if (dailySendCap !== initialCap) updates.dailySendCap = dailySendCap;
    if (JSON.stringify(searchQueries) !== JSON.stringify(initialQueries))
      updates.searchQueries = searchQueries;
    if (JSON.stringify(searchLocations) !== JSON.stringify(initialLocations))
      updates.searchLocations = searchLocations;

    startSaving(async () => {
      const result = await updateConfigAction(updates);
      if (result.ok) {
        toast.success("Settings saved");
      } else {
        toast.error(result.error ?? "Failed to save");
      }
    });
  }

  function handleSaveWeights() {
    startSavingWeights(async () => {
      const result = await updateScoringWeightsAction(weights);
      if (result.ok) {
        toast.success("Scoring weights saved");
      } else {
        toast.error(result.error ?? "Failed to save weights");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Gmail error banner */}
      {gmailError && (
        <div className="rounded-lg border border-[var(--color-danger)] bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-[var(--color-danger)]">
          Gmail connection failed: {gmailError.replace(/_/g, " ")}
        </div>
      )}

      {/* Profile Refresh */}
      <section className="surface p-5 space-y-3">
        <div className="flex items-center gap-2">
          <UserPen size={16} />
          <h2 className="text-sm font-semibold">Profile &amp; Outreach</h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Update your profile, positioning, and outreach preferences. Changes
          take effect on the next pipeline run.
        </p>
        <Link
          href="/onboard?mode=refresh"
          className="btn-ghost inline-flex items-center gap-1.5 text-sm"
        >
          <ExternalLink size={13} />
          Edit Profile
        </Link>
      </section>

      {/* Gmail Integration */}
      <section className="surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={16} />
          <h2 className="text-sm font-semibold">Gmail Integration</h2>
        </div>

        {gmailConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)]" />
              <span className="text-sm">
                Connected as{" "}
                <span className="font-medium">{gmailAddress ?? "unknown"}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isPending}
              className="btn-ghost flex items-center gap-1.5 text-xs text-[var(--color-danger)]"
            >
              <MailX size={13} />
              {isPending ? "Disconnecting..." : "Disconnect Gmail"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              Connect your Gmail account to send approved outreach emails
              directly from the pipeline.
            </p>
            <a
              href="/api/auth/gmail"
              className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2"
            >
              <ExternalLink size={13} />
              Connect Gmail
            </a>
          </div>
        )}
      </section>

      {/* Pipeline Configuration */}
      <section className="surface p-5 space-y-5">
        <h2 className="text-sm font-semibold">Pipeline Configuration</h2>

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

        {/* Search Queries */}
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
                  onClick={() => removeQuery(i)}
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

        {/* Search Locations */}
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
                  onClick={() => removeLocation(i)}
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

        {/* Cron Schedule (read-only) */}
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Cron Schedule</div>
          <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
            <Clock size={14} />
            Daily at 6:00 AM ET (10:00 UTC)
          </div>
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2"
        >
          <Save size={14} />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </section>

      {/* Scoring Profile — only renders when profile exists */}
      {scoringProfile && (
        <section className="surface p-5 space-y-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} />
            <h2 className="text-sm font-semibold">Scoring Profile</h2>
          </div>
          <p className="text-xs text-[var(--color-text-subtle)]">
            Derived from your profile. Adjust weights to prioritize what matters
            most in opportunity scoring (0.5x to 2.0x).
          </p>

          {/* Read-only derived tags */}
          <div className="space-y-3">
            {scoringProfile.target_roles.length > 0 && (
              <TagRow
                label="Target Roles"
                items={scoringProfile.target_roles}
              />
            )}
            {scoringProfile.tool_familiarity.length > 0 && (
              <TagRow label="Tools" items={scoringProfile.tool_familiarity} />
            )}
            {scoringProfile.preferred_stages.length > 0 && (
              <TagRow
                label="Preferred Stages"
                items={scoringProfile.preferred_stages}
              />
            )}
            {scoringProfile.preferred_domains.length > 0 && (
              <TagRow
                label="Preferred Domains"
                items={scoringProfile.preferred_domains}
              />
            )}
          </div>

          {/* Weight sliders */}
          <div className="space-y-4 pt-2">
            {WEIGHT_DIMENSIONS.map((dim) => (
              <div key={dim.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor={dim.key} className="text-sm font-medium">
                    {dim.label}
                  </label>
                  <span className="text-xs font-mono text-[var(--color-text-muted)] tabular-nums w-10 text-right">
                    {weights[dim.key].toFixed(1)}x
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-subtle)]">
                  {dim.desc}
                </p>
                <input
                  id={dim.key}
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={weights[dim.key]}
                  onChange={(e) =>
                    setWeights((prev) => ({
                      ...prev,
                      [dim.key]: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-[var(--color-blue)]"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveWeights}
            disabled={!isWeightsDirty || isSavingWeights}
            className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2"
          >
            <Save size={14} />
            {isSavingWeights ? "Saving..." : "Save Weights"}
          </button>
        </section>
      )}
    </div>
  );
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="badge text-xs">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
