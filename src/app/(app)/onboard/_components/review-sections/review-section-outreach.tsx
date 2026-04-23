"use client";

import { EditableProseSection } from "@/components/ui/editable-prose-section";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { OutreachTone } from "@/lib/onboarding/markdown";

interface ReviewSectionOutreachProps {
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
    <>
      <EditableProseSection
        title="Green Flags"
        kind="text"
        value={greenFlags}
        onCommit={onGreenFlagsChange}
        editable
      />
      <EditableProseSection
        title="Red Flags"
        kind="text"
        value={redFlags}
        onCommit={onRedFlagsChange}
        editable
      />
      <ReviewFormSection title="Outreach Tone">
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
      </ReviewFormSection>
      <EditableProseSection
        title="What's Worked"
        kind="text"
        value={whatsWorked}
        onCommit={onWhatsWorkedChange}
        editable
      />
      <EditableProseSection
        title="What to Avoid"
        kind="text"
        value={whatToAvoid}
        onCommit={onWhatToAvoidChange}
        editable
      />
    </>
  );
}
