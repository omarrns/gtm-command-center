"use client";

import type { OutreachTone } from "@/lib/onboarding/markdown";
import { SectionHeader } from "../section-header";

interface ReviewSectionOutreachProps {
  isExpanded: boolean;
  onToggle: () => void;
  greenFlags: string;
  onGreenFlagsChange: (value: string) => void;
  redFlags: string;
  onRedFlagsChange: (value: string) => void;
  outreachTone: OutreachTone;
  onOutreachToneChange: (tone: OutreachTone) => void;
  whatsWorked: string;
  onWhatsWorkedChange: (value: string) => void;
  whatToAvoid: string;
  onWhatToAvoidChange: (value: string) => void;
}

export function ReviewSectionOutreach({
  isExpanded,
  onToggle,
  greenFlags,
  onGreenFlagsChange,
  redFlags,
  onRedFlagsChange,
  outreachTone,
  onOutreachToneChange,
  whatsWorked,
  onWhatsWorkedChange,
  whatToAvoid,
  onWhatToAvoidChange,
}: ReviewSectionOutreachProps) {
  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title="Outreach"
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Green Flags</label>
            <textarea
              rows={3}
              value={greenFlags}
              onChange={(e) => onGreenFlagsChange(e.target.value)}
              className="input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Red Flags</label>
            <textarea
              rows={3}
              value={redFlags}
              onChange={(e) => onRedFlagsChange(e.target.value)}
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
                  onClick={() => onOutreachToneChange(tone)}
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
              onChange={(e) => onWhatsWorkedChange(e.target.value)}
              className="input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">What to Avoid</label>
            <textarea
              rows={2}
              value={whatToAvoid}
              onChange={(e) => onWhatToAvoidChange(e.target.value)}
              className="input"
            />
          </div>
        </div>
      )}
    </div>
  );
}
