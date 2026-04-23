"use client";

import { useState, useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OutcomeBadge } from "./outcome-badge";
import { cn } from "@/lib/utils";
import type { SalesCall } from "@/lib/calls/types";

type Tab = "analysis" | "chat" | "transcript";

interface CallDetailModalProps {
  call: SalesCall;
  callIndex: number;
  totalCalls: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-3">
      {children}
    </p>
  );
}

function AnalysisTab({ call }: { call: SalesCall }) {
  return (
    <div className="space-y-7">
      <section>
        <SectionLabel>Summary</SectionLabel>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          {call.analysis.summary}
        </p>
      </section>

      <section>
        <SectionLabel>Key Insights</SectionLabel>
        <ul className="space-y-2">
          {call.analysis.keyInsights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--color-blue)] shrink-0" />
              <span className="text-[var(--color-text)]">{insight}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionLabel>Coaching Notes</SectionLabel>
        <ul className="space-y-2">
          {call.analysis.coachingNotes.map((note, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--color-text-subtle)] shrink-0" />
              <span className="text-[var(--color-text)]">{note}</span>
            </li>
          ))}
        </ul>
      </section>

      {call.analysis.objections.length > 0 && (
        <section>
          <SectionLabel>
            Objections ({call.analysis.objections.length})
          </SectionLabel>
          <div className="space-y-4">
            {call.analysis.objections.map((obj, i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--color-border)] p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="warning">{obj.type}</Badge>
                  <Badge variant="accent">Response: {obj.responseRating}</Badge>
                </div>
                <p className="text-sm italic text-[var(--color-text)]">
                  &ldquo;{obj.quote}&rdquo;
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Rep Response: {obj.repResponse}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {call.analysis.painPoints.length > 0 && (
        <section>
          <SectionLabel>
            Pain Points ({call.analysis.painPoints.length})
          </SectionLabel>
          <ul className="space-y-2">
            {call.analysis.painPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--color-warning)] shrink-0" />
                <span className="text-[var(--color-text)]">{point}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ChatTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Sparkles size={28} className="text-[var(--color-text-subtle)] mb-3" />
      <p className="text-sm font-medium text-[var(--color-text)]">
        Chat with this call
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs">
        Ask questions about the call, get coaching advice, or draft follow-up
        emails.
      </p>
    </div>
  );
}

function TranscriptTab({ transcript }: { transcript: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-muted)] p-4">
      <pre className="text-xs text-[var(--color-text)] whitespace-pre-wrap leading-relaxed font-sans">
        {transcript}
      </pre>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "analysis", label: "Analysis" },
  { id: "chat", label: "Chat" },
];

export function CallDetailModal({
  call,
  callIndex,
  totalCalls,
  onClose,
  onPrev,
  onNext,
}: CallDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("analysis");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-3xl h-[88vh] overflow-hidden p-0 gap-0 flex flex-col"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <DialogTitle className="text-base font-semibold truncate">
                {call.title}
              </DialogTitle>
              <OutcomeBadge outcome={call.outcome} />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="shrink-0"
            >
              <X size={14} />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          <p className="text-xs text-[var(--color-text-muted)] mb-4">
            {call.rep}
            <span className="mx-1.5">•</span>
            {new Date(call.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            <span className="mx-1.5">•</span>
            {call.duration}
            <span className="mx-1.5">•</span>
            {call.account}
          </p>

          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-[var(--color-border)]">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative px-4 pb-2.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-100",
                  activeTab === tab.id
                    ? "text-[var(--color-blue)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {tab.id === "chat" && (
                  <Sparkles size={10} className="inline mr-1 mb-px" />
                )}
                {tab.label}
                {activeTab === tab.id && (
                  <motion.span
                    layoutId="call-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-blue)] rounded-t-full"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {activeTab === "analysis" && <AnalysisTab call={call} />}
              {activeTab === "chat" && <ChatTab />}
              {activeTab === "transcript" && (
                <TranscriptTab transcript={call.transcript} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--color-border)] px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span>
              {callIndex + 1} of {totalCalls}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onPrev}
              disabled={callIndex === 0}
            >
              <ChevronLeft size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onNext}
              disabled={callIndex === totalCalls - 1}
            >
              <ChevronRight size={12} />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost">
              <RefreshCw size={12} />
              Re-analyze
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveTab("transcript")}
            >
              <FileText size={12} />
              View Transcript
            </Button>
            <Button size="sm" onClick={() => setActiveTab("chat")}>
              <Sparkles size={12} />
              Chat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
