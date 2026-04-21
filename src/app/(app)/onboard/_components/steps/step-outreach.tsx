"use client";

import { Textarea } from "@/components/ui/textarea";
import type { OutreachTone } from "@/lib/onboarding/markdown";

interface StepOutreachProps {
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

export function StepOutreach({
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
}: StepOutreachProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="green-flags" className="text-sm font-medium">
          Green Flags
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          What makes a company worth pursuing?
        </p>
        <Textarea
          id="green-flags"
          rows={3}
          value={greenFlags}
          onChange={(e) => onGreenFlagsChange(e.target.value)}
          placeholder={
            "Series A-C, product-led growth, small GTM team, technical founders"
          }
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="red-flags" className="text-sm font-medium">
          Red Flags
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          Immediate disqualifiers
        </p>
        <Textarea
          id="red-flags"
          rows={3}
          value={redFlags}
          onChange={(e) => onRedFlagsChange(e.target.value)}
          placeholder={
            "Enterprise-only sales motion, no product yet, agency/consultancy"
          }
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Outreach Tone</label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          How should your emails sound?
        </p>
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
        <label htmlFor="whats-worked" className="text-sm font-medium">
          What&apos;s Worked
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          Validated patterns, subject lines, framing that got replies
        </p>
        <Textarea
          id="whats-worked"
          rows={3}
          value={whatsWorked}
          onChange={(e) => onWhatsWorkedChange(e.target.value)}
          placeholder={
            "Peer frame over applicant frame, simple binary asks, no research mirror-backs"
          }
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="what-to-avoid" className="text-sm font-medium">
          What to Avoid
        </label>
        <p className="text-xs text-[var(--color-text-subtle)]">
          Anti-patterns, things that bombed
        </p>
        <Textarea
          id="what-to-avoid"
          rows={3}
          value={whatToAvoid}
          onChange={(e) => onWhatToAvoidChange(e.target.value)}
          placeholder={
            "Long intros, flattery, bullet-heavy emails, 'I noticed you...' openers"
          }
        />
      </div>
    </div>
  );
}
