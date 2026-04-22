"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

interface StoryHandoffProps {
  onStart: () => void;
}

export function StoryHandoff({ onStart }: StoryHandoffProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto max-w-md p-6 pt-20"
    >
      <div className="surface p-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight mb-3">
          I&apos;ve got enough to work with.
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">
          I took notes on everything. Want to read what I wrote about you?
        </p>

        <Button type="button" onClick={onStart} className="w-full">
          Read my story
        </Button>

        <p className="text-xs text-[var(--color-text-subtle)] mt-4">
          Takes about thirty seconds.
        </p>
      </div>
    </motion.div>
  );
}
