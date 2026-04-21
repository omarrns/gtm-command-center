"use client";

import { TagInput } from "@/components/tag-input";

interface StepSearchProps {
  searchQueries: string[];
  onSearchQueriesChange: (values: string[]) => void;
  searchLocations: string[];
  onSearchLocationsChange: (values: string[]) => void;
  scoreThreshold: number;
  onScoreThresholdChange: (value: number) => void;
  dailySendCap: number;
  onDailySendCapChange: (value: number) => void;
}

export function StepSearch({
  searchQueries,
  onSearchQueriesChange,
  searchLocations,
  onSearchLocationsChange,
  scoreThreshold,
  onScoreThresholdChange,
  dailySendCap,
  onDailySendCapChange,
}: StepSearchProps) {
  return (
    <div className="space-y-5">
      <TagInput
        values={searchQueries}
        onChange={onSearchQueriesChange}
        inputId="query-input"
        label="Search Queries"
        description="Job titles to search for (max 10)"
        placeholder="Add a search query..."
        itemNoun="query"
        itemNounPlural="search queries"
      />

      <TagInput
        values={searchLocations}
        onChange={onSearchLocationsChange}
        inputId="location-input"
        label="Search Locations"
        description="Locations to search in (max 10)"
        placeholder="Add a location..."
        itemNoun="location"
        itemNounPlural="search locations"
      />

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
            onScoreThresholdChange(
              Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
            )
          }
          className="input w-28"
        />
      </div>

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
            onDailySendCapChange(
              Math.max(0, Math.min(50, parseInt(e.target.value) || 0)),
            )
          }
          className="input w-28"
        />
      </div>
    </div>
  );
}
