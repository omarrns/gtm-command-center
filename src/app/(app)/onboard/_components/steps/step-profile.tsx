"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface StepProfileProps {
  positioning: string;
  onPositioningChange: (value: string) => void;
  careerHighlights: string;
  onCareerHighlightsChange: (value: string) => void;
  proofPoints: string;
  onProofPointsChange: (value: string) => void;
  technicalTools: string;
  onTechnicalToolsChange: (value: string) => void;
}

export function StepProfile({
  positioning,
  onPositioningChange,
  careerHighlights,
  onCareerHighlightsChange,
  proofPoints,
  onProofPointsChange,
  technicalTools,
  onTechnicalToolsChange,
}: StepProfileProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="positioning" className="text-sm font-medium">
          Positioning Statement
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          One line: &quot;I&apos;m a ___ who ___&quot;
        </p>
        <Input
          id="positioning"
          type="text"
          value={positioning}
          onChange={(e) => onPositioningChange(e.target.value)}
          placeholder={
            'e.g. "I\'m a GTM Engineer who builds pipeline through data, APIs, and automation"'
          }
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="highlights" className="text-sm font-medium">
          Career Highlights
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          3-5 bullets with metrics, reverse chronological
        </p>
        <Textarea
          id="highlights"
          rows={5}
          value={careerHighlights}
          onChange={(e) => onCareerHighlightsChange(e.target.value)}
          placeholder={
            "- Built Compass at Inkeep: 400K+ impressions, 50+ enterprise leads\n- Grew Mira Migo to 3K users, $6K MRR peak\n- 500 Global: automated 500+ investor updates/month with GPT-4"
          }
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="proof-points" className="text-sm font-medium">
          Top Proof Points
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          3 hero accomplishments used in email drafts
        </p>
        <Textarea
          id="proof-points"
          rows={4}
          value={proofPoints}
          onChange={(e) => onProofPointsChange(e.target.value)}
          placeholder={
            "- Closed-loop GTM platform: Gong calls → AI extraction → content → attribution\n- Built and sold Compresso in 1 week to a YC startup\n- 100x GEO growth through repeatable experimentation"
          }
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tools" className="text-sm font-medium">
          Technical Tools
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          Comma-separated tools and platforms you use
        </p>
        <Input
          id="tools"
          type="text"
          value={technicalTools}
          onChange={(e) => onTechnicalToolsChange(e.target.value)}
          placeholder="Claude SDK, Node.js, TypeScript, PostHog, n8n, Vercel"
        />
      </div>
    </div>
  );
}
