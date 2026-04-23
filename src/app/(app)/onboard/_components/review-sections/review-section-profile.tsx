"use client";

import { EditableProseSection } from "@/components/ui/editable-prose-section";

interface ReviewSectionProfileProps {
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
    <>
      <EditableProseSection
        title="Positioning"
        kind="text"
        value={positioning}
        onCommit={onPositioningChange}
        editable
      />
      <EditableProseSection
        title="Career Highlights"
        kind="text"
        value={careerHighlights}
        onCommit={onCareerHighlightsChange}
        editable
      />
      <EditableProseSection
        title="Proof Points"
        kind="text"
        value={proofPoints}
        onCommit={onProofPointsChange}
        editable
      />
      <EditableProseSection
        title="Technical Tools"
        kind="text"
        value={technicalTools}
        onCommit={onTechnicalToolsChange}
        editable
      />
    </>
  );
}
