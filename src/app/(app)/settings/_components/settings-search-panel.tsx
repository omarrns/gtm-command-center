"use client";

import { useState, useTransition } from "react";
import { Clock, Save } from "lucide-react";
import { toast } from "sonner";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateConfigAction } from "../actions";

interface SettingsSearchPanelProps {
  scoreThreshold: number;
  dailySendCap: number;
  searchQueries: string[];
  searchLocations: string[];
}

export function SettingsSearchPanel({
  scoreThreshold: initialThreshold,
  dailySendCap: initialCap,
  searchQueries: initialQueries,
  searchLocations: initialLocations,
}: SettingsSearchPanelProps) {
  const [isSaving, startSaving] = useTransition();
  const [scoreThreshold, setScoreThreshold] = useState(initialThreshold);
  const [dailySendCap, setDailySendCap] = useState(initialCap);
  const [searchQueries, setSearchQueries] = useState(initialQueries);
  const [searchLocations, setSearchLocations] = useState(initialLocations);

  const isDirty =
    scoreThreshold !== initialThreshold ||
    dailySendCap !== initialCap ||
    JSON.stringify(searchQueries) !== JSON.stringify(initialQueries) ||
    JSON.stringify(searchLocations) !== JSON.stringify(initialLocations);

  function handleSave() {
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

  return (
    <Card className="gap-5 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Pipeline Configuration</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Controls how jobs are discovered, scored, and emailed.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="score-threshold" className="text-sm font-medium">
          Score Threshold
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          Minimum score for opportunities to pass scoring (0-100)
        </p>
        <Input
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
          className="w-28"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="daily-send-cap" className="text-sm font-medium">
          Daily Send Cap
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          Maximum emails sent per day (0-50)
        </p>
        <Input
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
          className="w-28"
        />
      </div>

      <TagInput
        values={searchQueries}
        onChange={setSearchQueries}
        inputId="query-input"
        label="Search Queries"
        description="Job titles to search for (max 10)"
        placeholder="Add a search query..."
        itemNoun="query"
        itemNounPlural="search queries"
      />

      <TagInput
        values={searchLocations}
        onChange={setSearchLocations}
        inputId="location-input"
        label="Search Locations"
        description="Locations to search in (max 10)"
        placeholder="Add a location..."
        itemNoun="location"
        itemNounPlural="search locations"
      />

      <div className="space-y-1.5">
        <div className="text-sm font-medium">Cron Schedule</div>
        <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
          <Clock size={14} />
          Daily at 6:00 AM ET (10:00 UTC)
        </div>
      </div>

      <Button
        type="button"
        onClick={handleSave}
        disabled={!isDirty || isSaving}
      >
        <Save size={14} />
        {isSaving ? "Saving..." : "Save Changes"}
      </Button>
    </Card>
  );
}
