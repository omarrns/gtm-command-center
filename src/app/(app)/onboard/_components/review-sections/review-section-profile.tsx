"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "../section-header";

interface ReviewSectionProfileProps {
  isExpanded: boolean;
  onToggle: () => void;
  positioning: string;
  onPositioningChange: (value: string) => void;
  careerHighlights: string;
  onCareerHighlightsChange: (value: string) => void;
  proofPoints: string;
  onProofPointsChange: (value: string) => void;
  technicalTools: string;
  onTechnicalToolsChange: (value: string) => void;
}

export function ReviewSectionProfile({
  isExpanded,
  onToggle,
  positioning,
  onPositioningChange,
  careerHighlights,
  onCareerHighlightsChange,
  proofPoints,
  onProofPointsChange,
  technicalTools,
  onTechnicalToolsChange,
}: ReviewSectionProfileProps) {
  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title="Profile"
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Positioning</label>
            <Input
              type="text"
              value={positioning}
              onChange={(e) => onPositioningChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Career Highlights</label>
            <Textarea
              rows={4}
              value={careerHighlights}
              onChange={(e) => onCareerHighlightsChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Proof Points</label>
            <Textarea
              rows={3}
              value={proofPoints}
              onChange={(e) => onProofPointsChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Technical Tools</label>
            <Input
              type="text"
              value={technicalTools}
              onChange={(e) => onTechnicalToolsChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
