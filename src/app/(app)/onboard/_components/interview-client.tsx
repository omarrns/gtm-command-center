"use client";

import { useEffect, useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Loader } from "@/components/ai-elements/loader";
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

const OPENING_MESSAGE: UIMessage = {
  id: "opening",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Hey! I'm here to get a quick read on who you are professionally so we can find the right opportunities for you. Let's start with the big picture — what do you do, and what makes you different from others with a similar title? Give me the version you'd use with someone in tech but not your exact field.",
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

function extractDisplayText(msg: UIMessage): string {
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .replace(/\[INTERVIEW_COMPLETE\]/g, "")
    .trim();
}

export function InterviewClient({
  interview,
  onExtracted,
  onSwitchToManual,
}: InterviewClientProps) {
  const [input, setInput] = useState("");
  const [isExtracting, startExtraction] = useTransition();
  const [topicsCovered, setTopicsCovered] = useState<string[]>(
    interview.topics_covered,
  );

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

  const isSubmitted = status === "submitted";
  const isStreaming = isSubmitted || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistant = isSubmitted && lastMessage?.role === "user";

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

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text?.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ text });
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
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
        {INTERVIEW_TOPICS.map((topic) => {
          const covered = topicsCovered.includes(topic);
          return (
            <div key={topic} className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  covered ? "bg-[var(--color-success)]" : "bg-[var(--border)]"
                }`}
              />
              <span
                className={`text-[10px] hidden sm:inline transition-colors ${
                  covered
                    ? "text-[var(--color-text-muted)]"
                    : "text-[var(--color-text-subtle)]"
                }`}
              >
                {TOPIC_LABELS[topic]}
              </span>
            </div>
          );
        })}
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="max-w-2xl mx-auto w-full">
          {messages.map((msg) => {
            const text = extractDisplayText(msg);
            if (!text) return null;

            return (
              <Message key={msg.id} from={msg.role}>
                <MessageContent>
                  {msg.role === "assistant" ? (
                    <MessageResponse>{text}</MessageResponse>
                  ) : (
                    <p className="whitespace-pre-wrap">{text}</p>
                  )}
                </MessageContent>
              </Message>
            );
          })}

          {awaitingAssistant && (
            <Message from="assistant">
              <MessageContent>
                <Loader size={16} />
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-4 pb-4 pt-2 shrink-0">
        <PromptInput
          onSubmit={handleSubmit}
          className="bg-card border border-[var(--color-border-strong)] shadow-sm rounded-xl overflow-hidden focus-within:border-[var(--color-blue)] focus-within:ring-2 focus-within:ring-[var(--color-blue-muted)] transition-colors"
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to continue..."
            disabled={isStreaming}
            className="bg-transparent border-0 focus-visible:ring-0 focus-visible:border-0"
          />
          <PromptInputFooter className="bg-[var(--color-surface-muted)] border-t border-[var(--border)]">
            <PromptInputTools>
              <button
                type="button"
                onClick={onSwitchToManual}
                className="text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors px-2"
              >
                Skip to manual entry
              </button>
            </PromptInputTools>
            <PromptInputSubmit
              status={status}
              disabled={!input.trim() || isStreaming}
              className="bg-[var(--color-blue)] text-white hover:bg-[var(--color-blue)]/90 disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-subtle)]"
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
