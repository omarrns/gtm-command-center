"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

interface CyclicLoaderProps {
  messages: string[];
  interval?: number;
  className?: string;
}

export function CyclicLoader({
  messages,
  interval = 2000,
  className,
}: CyclicLoaderProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % messages.length);
    }, interval);
    return () => clearInterval(id);
  }, [messages.length, interval]);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            className="h-1 w-1 rounded-full bg-[var(--color-blue)] animate-pulse"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <div className="relative h-4 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={idx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-xs text-[var(--color-text-muted)] absolute whitespace-nowrap"
          >
            {messages[idx]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
