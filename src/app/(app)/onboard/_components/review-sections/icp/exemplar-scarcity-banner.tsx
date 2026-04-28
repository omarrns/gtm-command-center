"use client";

import { Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";

// SPEC-3 Phase 5.c: shown above the ICP review when positive-exemplar
// count is 0, 1, or 2. The orchestrator marks exemplar-derived
// sub-dimensions as weak evidence until there are enough examples to
// consolidate a pattern. Does NOT block confirm; the user might
// reasonably ship a declarative-only rubric and add exemplars later.

interface ExemplarScarcityBannerProps {
  positiveExemplarCount: number;
}

function copyForCount(count: number): { title: string; body: string } | null {
  if (count >= 3) return null;
  if (count === 0) {
    return {
      title: "No positive exemplars uploaded",
      body: "We built this rubric from your declared ICP only. Add 3+ customers you'd want more of to get pattern-extracted firmographics, technographics, and signals.",
    };
  }
  if (count === 1) {
    return {
      title: "Only 1 positive exemplar",
      body: "One example is evidence, not a pattern. Exemplar-derived sub-dimensions stay marked as weak evidence until 3+ positive exemplars consolidate the pattern.",
    };
  }
  return {
    title: "Only 2 positive exemplars",
    body: "Two examples are thin signal. Exemplar-derived sub-dimensions stay marked as weak evidence until one more positive exemplar consolidates the pattern.",
  };
}

export function ExemplarScarcityBanner({
  positiveExemplarCount,
}: ExemplarScarcityBannerProps) {
  const copy = copyForCount(positiveExemplarCount);
  if (!copy) return null;

  return (
    <Alert className="mb-8">
      <Info size={14} />
      <div className="text-xs space-y-1">
        <p className="font-medium">{copy.title}</p>
        <p className="text-[var(--color-text-muted)]">{copy.body}</p>
      </div>
    </Alert>
  );
}
