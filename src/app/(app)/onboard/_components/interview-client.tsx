"use client";

import { useRef, useEffect, useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { Bot, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  INTERVIEW_TOPICS,
  type InterviewTopic,
} from "@/lib/onboarding/interview-prompt";
import {
  extractAndReviewAction,
  checkInterviewStateAction,
} from "../interview-actions";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

interface InterviewClientProps {
  interview: OnboardingInterviewRow;
  onExtracted: (interview: OnboardingInterviewRow) => void;
  onSwitchToManual: () => void;
}

const TOPIC_LABELS: Record<InterviewTopic, string> = {
  identity: "Identity",
  career: "Career",
  proof_points: "Proof Points",
  tools: "Tools",
  search_prefs: "Search",
  dealbreakers: "Dealbreakers",
  outreach_style: "Outreach",
};

// Opening message for new interviews
const OPENING_MESSAGE: UIMessage = {
  id: "opening",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Hey! I'm here to get a quick read on who you are professionally so we can find the right opportunities for you. Let's start with the big picture \u2014 what do you do, and what makes you different from others with a similar title? Give me the version you'd use with someone in tech but not your exact field.",
    },
  ],
};

const REFRESH_OPENING_MESSAGE: UIMessage = {
  id: "opening",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Welcome back! Let's update your profile. What's changed since we last talked? Any new roles, different priorities, or shifts in what you're looking for?",
    },
  ],
};

export function InterviewClient({
  interview,
  onExtracted,
  onSwitchToManual,
}: InterviewClientProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [isExtracting, startExtraction] = useTransition();
  const [topicsCovered, setTopicsCovered] = useState<string[]>(
    interview.topics_covered,
  );

  // Determine initial messages
  const storedMessages = interview.messages as UIMessage[];
  const initialMessages =
    storedMessages.length > 0
      ? storedMessages
      : [interview.is_refresh ? REFRESH_OPENING_MESSAGE : OPENING_MESSAGE];

  const { messages, sendMessage, status } = useChat({
    id: interview.id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/onboard/chat",
      body: { interviewId: interview.id },
    }),
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // After each assistant response, refetch server state to check for
  // ready_for_extraction (set server-side in onFinish) and updated topics.
  useEffect(() => {
    if (status !== "ready") return;

    let cancelled = false;

    async function checkServerState() {
      try {
        const state = await checkInterviewStateAction(interview.id);
        if (cancelled) return;

        if (state.topicsCovered.length !== topicsCovered.length) {
          setTopicsCovered(state.topicsCovered);
        }

        if (state.readyForExtraction) {
          startExtraction(async () => {
            const result = await extractAndReviewAction(interview.id);
            if (result.ok) {
              onExtracted(result.interview);
            } else {
              toast.error(
                result.error ?? "Profile extraction failed — try again",
              );
            }
          });
        }
      } catch {
        toast.error("Could not sync interview state — please refresh");
      }
    }

    checkServerState();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ text });
  }

  // Filter out tool parts for display
  function getVisibleParts(msg: UIMessage) {
    return msg.parts.filter((p) => {
      if (p.type === "text") return true;
      // Hide all tool-related parts
      return false;
    });
  }

  if (isExtracting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={24} className="animate-spin text-[var(--color-blue)]" />
        <p className="text-sm text-[var(--color-text-muted)]">
          Preparing your profile summary...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto">
      {/* Topic progress dots */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        {INTERVIEW_TOPICS.map((topic) => (
          <div key={topic} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                topicsCovered.includes(topic)
                  ? "bg-[var(--color-success)]"
                  : "bg-[var(--border)]"
              }`}
            />
            <span className="text-[10px] text-[var(--color-text-subtle)] hidden sm:inline">
              {TOPIC_LABELS[topic]}
            </span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => {
          const visibleParts = getVisibleParts(msg);
          if (visibleParts.length === 0) return null;

          const isAssistant = msg.role === "assistant";

          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isAssistant ? "" : "flex-row-reverse"}`}
            >
              {isAssistant && (
                <div className="flex-shrink-0 mt-1">
                  <div className="h-7 w-7 rounded-full bg-[var(--color-blue-muted)] flex items-center justify-center">
                    <Bot size={14} className="text-[var(--color-blue)]" />
                  </div>
                </div>
              )}
              <div
                className={`surface px-3.5 py-2.5 max-w-[80%] ${
                  isAssistant
                    ? ""
                    : "bg-[var(--color-blue)] text-white border-transparent"
                }`}
              >
                {visibleParts.map((part, i) => {
                  if (part.type === "text") {
                    // Strip the [INTERVIEW_COMPLETE] marker from display
                    const displayText = part.text
                      .replace(/\[INTERVIEW_COMPLETE\]/g, "")
                      .trim();
                    if (!displayText) return null;
                    return (
                      <p key={i} className="text-sm whitespace-pre-wrap">
                        {displayText}
                      </p>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex gap-2.5">
            <div className="flex-shrink-0 mt-1">
              <div className="h-7 w-7 rounded-full bg-[var(--color-blue-muted)] flex items-center justify-center">
                <Bot size={14} className="text-[var(--color-blue)]" />
              </div>
            </div>
            <div className="surface px-3.5 py-2.5">
              <span className="inline-block h-4 w-1 bg-[var(--color-text-muted)] animate-pulse" />
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your response..."
            disabled={isStreaming}
            className="flex-1"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            <Send size={14} />
          </Button>
        </div>
        <div className="mt-2 text-center">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onSwitchToManual}
            className="text-[var(--color-text-subtle)]"
          >
            Skip to manual entry
          </Button>
        </div>
      </div>
    </div>
  );
}
