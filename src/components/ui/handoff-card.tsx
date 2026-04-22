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

// Centered "next phase" ceremony card. Use when a feature transitions
// the user from one chunk of work to another and the moment deserves a
// pause — e.g. before kicking off a long-running stream the user should
// anticipate. Single CTA by design; the commitment is the click.
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
