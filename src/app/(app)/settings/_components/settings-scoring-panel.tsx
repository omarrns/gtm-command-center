"use client";

import { useState, useTransition } from "react";
import { Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { updateScoringWeightsAction } from "../actions";
import type { UserScoringProfileRow } from "@/lib/supabase/types";

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

interface SettingsScoringPanelProps {
  scoringProfile: UserScoringProfileRow;
}

export function SettingsScoringPanel({
  scoringProfile,
}: SettingsScoringPanelProps) {
  const [isSavingWeights, startSavingWeights] = useTransition();
  const [weights, setWeights] = useState<Record<WeightKey, number>>(
    () =>
      Object.fromEntries(
        WEIGHT_DIMENSIONS.map((d) => [d.key, scoringProfile[d.key]]),
      ) as Record<WeightKey, number>,
  );

  const initialWeights = Object.fromEntries(
    WEIGHT_DIMENSIONS.map((d) => [d.key, scoringProfile[d.key]]),
  );

  const isWeightsDirty = WEIGHT_DIMENSIONS.some(
    (d) => weights[d.key] !== initialWeights[d.key as WeightKey],
  );

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
    <section className="surface p-5 space-y-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={16} />
        <h2 className="text-sm font-semibold">Scoring Profile</h2>
      </div>
      <p className="text-xs text-[var(--color-text-subtle)]">
        Derived from your profile. Adjust weights to prioritize what matters
        most in opportunity scoring (0.5x to 2.0x).
      </p>

      <div className="space-y-3">
        {scoringProfile.target_roles.length > 0 && (
          <TagRow label="Target Roles" items={scoringProfile.target_roles} />
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
