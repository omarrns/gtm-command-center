"use client";

import { FadeIn } from "./fade-in";

interface ReviewFormSectionProps {
  title: string;
  children: React.ReactNode;
}

export function ReviewFormSection({ title, children }: ReviewFormSectionProps) {
  return (
    <FadeIn className="mb-8">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-4">
          {title}
        </h2>
        {children}
      </section>
    </FadeIn>
  );
}
