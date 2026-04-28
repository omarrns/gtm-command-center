"use client";

import { FadeIn } from "./fade-in";

interface ReviewFormSectionProps {
  title: string;
  children: React.ReactNode;
  // Optional right-aligned meta slot next to the section heading.
  // ICP review surfaces show completeness fraction + evidence-strength
  // label here; other surfaces can ignore it.
  meta?: React.ReactNode;
}

export function ReviewFormSection({
  title,
  children,
  meta,
}: ReviewFormSectionProps) {
  return (
    <FadeIn className="mb-8">
      <section>
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {title}
          </h2>
          {meta && (
            <div className="text-[10px] text-[var(--color-text-subtle)] flex items-center gap-1.5">
              {meta}
            </div>
          )}
        </div>
        {children}
      </section>
    </FadeIn>
  );
}
