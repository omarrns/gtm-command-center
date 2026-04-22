"use client";

import { motion } from "motion/react";

interface ReviewFormSectionProps {
  title: string;
  children: React.ReactNode;
}

export function ReviewFormSection({ title, children }: ReviewFormSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-8"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-4">
        {title}
      </h2>
      {children}
    </motion.section>
  );
}
