"use client";

import { TagInput } from "@/components/tag-input";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "../section-header";

interface ReviewSectionSearchProps {
  isExpanded: boolean;
  onToggle: () => void;
  searchQueries: string[];
  onSearchQueriesChange: (values: string[]) => void;
  searchLocations: string[];
  onSearchLocationsChange: (values: string[]) => void;
  scoreThreshold: number;
  onScoreThresholdChange: (value: number) => void;
  dailySendCap: number;
  onDailySendCapChange: (value: number) => void;
}

export function ReviewSectionSearch({
  isExpanded,
  onToggle,
  searchQueries,
  onSearchQueriesChange,
  searchLocations,
  onSearchLocationsChange,
  scoreThreshold,
  onScoreThresholdChange,
  dailySendCap,
  onDailySendCapChange,
}: ReviewSectionSearchProps) {
  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title="Search Preferences"
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="space-y-4 mt-2">
          <TagInput
            values={searchQueries}
            onChange={onSearchQueriesChange}
            inputId="review-query-input"
            label="Search Queries"
            description="Job titles to search for (max 10)"
            placeholder="Add a search query..."
            itemNoun="query"
            itemNounPlural="search queries"
          />
          <TagInput
            values={searchLocations}
            onChange={onSearchLocationsChange}
            inputId="review-location-input"
            label="Locations"
            description="Locations to search in (max 10)"
            placeholder="Add a location..."
            itemNoun="location"
            itemNounPlural="search locations"
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Score Threshold</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={scoreThreshold}
                onChange={(e) =>
                  onScoreThresholdChange(
                    Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                  )
                }
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Daily Send Cap</label>
              <Input
                type="number"
                min={0}
                max={50}
                value={dailySendCap}
                onChange={(e) =>
                  onDailySendCapChange(
                    Math.max(0, Math.min(50, parseInt(e.target.value) || 0)),
                  )
                }
                className="w-24"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
