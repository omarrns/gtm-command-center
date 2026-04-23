// =============================================================================
// HandoffCard
// =============================================================================
//
// Centered, ceremonial "next phase" card. Use to mark a transition between
// two chunks of work where the user should pause and commit before
// proceeding. Single CTA by design — the moment IS the click; a secondary
// option dilutes the ceremony.
//
// Typical use cases:
//   • Kickoff before a long-running stream (give the wait a meaning).
//   • A phase boundary in a multi-step flow that deserves visual weight.
//   • Any "are you ready" moment where two clicks beat one.
//
// Props:
//   title         — single-line headline ("I've got enough to work with.")
//   description   — one short sentence framing what's next
//   ctaLabel      — primary action ("Read my story")
//   onCta         — fired on click
//   ctaSubtext    — optional muted line under the button (e.g. expected duration)
//   ctaDisabled   — optional, disables the CTA
//
// Layout: max-w-md, centered, surface-style card, fade-in + small Y rise on
// mount. No header chrome — meant to be the only thing on screen.
// =============================================================================

"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

interface HandoffCardProps {
  title: string;
  description: string;
  ctaLabel: string;
  onCta: () => void;
  ctaSubtext?: string;
  ctaDisabled?: boolean;
}

export function HandoffCard({
  title,
  description,
  ctaLabel,
  onCta,
  ctaSubtext,
  ctaDisabled,
}: HandoffCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto max-w-md p-6 pt-20"
    >
      <div className="surface p-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight mb-3">{title}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">
          {description}
        </p>

        <Button
          type="button"
          onClick={onCta}
          disabled={ctaDisabled}
          className="w-full"
        >
          {ctaLabel}
        </Button>

        {ctaSubtext && (
          <p className="text-xs text-[var(--color-text-subtle)] mt-4">
            {ctaSubtext}
          </p>
        )}
      </div>
    </motion.div>
  );
}
