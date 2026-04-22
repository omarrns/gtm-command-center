"use client";

import { useEffect, useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { Loader2, RefreshCw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  extractAndReviewAction,
  checkInterviewStateAction,
  getOrchestratorStateAction,
  startAgenticInterviewAction,
} from "../interview-actions";
import { ArtifactInput } from "./artifact-input";
import { OrchestratorStatusPanel } from "./orchestrator-status-panel";
import { SwitchPersonaControl } from "./switch-persona-control";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { ClientInterviewTemplate } from "@/lib/onboarding/templates/types";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

interface InterviewClientProps {
  interview: OnboardingInterviewRow;
  clientTemplate: ClientInterviewTemplate;
  onExtracted: (interview: OnboardingInterviewRow) => void;
  onSwitchToManual: () => void;
}

function buildOpening(text: string): UIMessage {
  return {
    id: "opening",
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

function extractDisplayText(msg: UIMessage): string {
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .replace(/\[INTERVIEW_COMPLETE\]/g, "")
    .trim();
}

export function InterviewClient(props: InterviewClientProps) {
  if (props.clientTemplate.agenticMode) {
    return <AgenticInterview {...props} />;
  }
  return <LegacyInterview {...props} />;
}

// ──────────────────────────────────────────────────────────────────────
// Agentic: artifact drop → kickoff → chat with orchestrator status panel
// ──────────────────────────────────────────────────────────────────────
//
// Split into two components so `useChat` is never called conditionally:
//  - AgenticInterview owns phase/kickoff/orchestratorState. No useChat.
//  - AgenticChat owns useChat and the turn-by-turn polling. Mounted as a
//    whole once initialMessages is known.

type KickoffState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; message: UIMessage }
  | { status: "alreadyComplete" }
  | { status: "error"; error: string };

function AgenticInterview({
  interview,
  clientTemplate,
  onExtracted,
  onSwitchToManual,
}: InterviewClientProps) {
  const [isExtracting, startExtraction] = useTransition();

  const initialState =
    (interview.orchestrator_state as OrchestratorState | null) ?? null;
  const [orchestratorState, setOrchestratorState] =
    useState<OrchestratorState | null>(initialState);

  const hasPriorAnalysis =
    (initialState?.dimensions &&
      Object.keys(initialState.dimensions).length > 0) ||
    (initialState?.artifacts.length ?? 0) > 0;
  const [phase, setPhase] = useState<"artifacts" | "chat">(
    hasPriorAnalysis ? "chat" : "artifacts",
  );

  const storedMessages = (interview.messages as UIMessage[]) ?? [];
  const hasStored = storedMessages.length > 0;

  const [kickoff, setKickoff] = useState<KickoffState>({ status: "idle" });

  function triggerReview() {
    startExtraction(async () => {
      const result = await extractAndReviewAction(interview.id);
      if (result.ok) onExtracted(result.interview);
      else toast.error(result.error ?? "Review could not load");
    });
  }

  // Kickoff the first orchestrator-driven question when the user enters the
  // chat phase on a brand-new interview. hasStored interviews resume from
  // their persisted messages and skip this entirely.
  useEffect(() => {
    if (phase !== "chat" || hasStored || kickoff.status !== "idle") return;
    setKickoff({ status: "loading" });
    let cancelled = false;

    (async () => {
      const result = await startAgenticInterviewAction(interview.id);
      if (cancelled) return;
      if (!result.ok) {
        setKickoff({ status: "error", error: result.error });
        toast.error(result.error);
        return;
      }
      if ("ready" in result && result.ready) {
        // Every dimension above threshold — server already set status='review'
        // and hydrated extracted_*. Route directly to review.
        setKickoff({ status: "alreadyComplete" });
        triggerReview();
        return;
      }
      if ("message" in result) {
        setKickoff({ status: "ready", message: result.message });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hasStored, interview.id]);

  if (isExtracting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={24} className="animate-spin text-[var(--color-blue)]" />
        <p className="text-sm text-[var(--color-text-muted)]">
          Preparing your review…
        </p>
      </div>
    );
  }

  if (phase === "artifacts") {
    return (
      <div>
        <div className="mx-auto flex max-w-2xl items-center justify-end px-6 pt-4">
          <SwitchPersonaControl
            interviewId={interview.id}
            currentTemplateId={clientTemplate.id}
          />
        </div>
        <ArtifactInput
          interviewId={interview.id}
          templateId={clientTemplate.id}
          onStateUpdated={setOrchestratorState}
          onReadyToChat={() => setPhase("chat")}
        />
      </div>
    );
  }

  // Chat phase: brand-new interview still waiting on kickoff.
  if (!hasStored && kickoff.status === "loading") {
    return <GeneratingFirstQuestion />;
  }
  if (!hasStored && kickoff.status === "alreadyComplete") {
    return <GeneratingFirstQuestion note="Finalizing…" />;
  }
  if (!hasStored && kickoff.status === "error") {
    return (
      <KickoffError
        error={kickoff.error}
        onRetry={() => setKickoff({ status: "idle" })}
      />
    );
  }

  const initialMessages: UIMessage[] = hasStored
    ? storedMessages
    : kickoff.status === "ready"
      ? [kickoff.message]
      : [];

  return (
    <AgenticChat
      interview={interview}
      clientTemplate={clientTemplate}
      initialMessages={initialMessages}
      orchestratorState={orchestratorState}
      onOrchestratorStateUpdate={setOrchestratorState}
      onInterviewComplete={triggerReview}
      onSwitchToManual={onSwitchToManual}
    />
  );
}

function GeneratingFirstQuestion({
  note = "Reading what you shared…",
}: {
  note?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <RefreshCw size={20} className="animate-spin text-[var(--color-blue)]" />
      <p className="text-sm text-[var(--color-text-muted)]">{note}</p>
    </div>
  );
}

function KickoffError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 max-w-md mx-auto text-center">
      <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
      <Button onClick={onRetry} variant="outline">
        Try again
      </Button>
    </div>
  );
}

interface AgenticChatProps {
  interview: OnboardingInterviewRow;
  clientTemplate: ClientInterviewTemplate;
  initialMessages: UIMessage[];
  orchestratorState: OrchestratorState | null;
  onOrchestratorStateUpdate: (state: OrchestratorState) => void;
  onInterviewComplete: () => void;
  onSwitchToManual: () => void;
}

function AgenticChat({
  interview,
  clientTemplate,
  initialMessages,
  orchestratorState,
  onOrchestratorStateUpdate,
  onInterviewComplete,
  onSwitchToManual,
}: AgenticChatProps) {
  const [input, setInput] = useState("");

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

  // After each completed turn, poll orchestrator state + interview status.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    (async () => {
      try {
        const snapshot = await getOrchestratorStateAction(interview.id);
        if (cancelled) return;
        if (snapshot.orchestratorState) {
          onOrchestratorStateUpdate(snapshot.orchestratorState);
        }
        if (snapshot.interviewStatus === "review") {
          onInterviewComplete();
        }
      } catch {
        // transient — next turn will retry
      }
    })();

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

  return (
    <div className="flex h-[calc(100dvh-8rem)] w-full flex-col">
      <div className="flex items-center justify-end px-6 pt-4 max-w-2xl mx-auto w-full">
        <SwitchPersonaControl
          interviewId={interview.id}
          currentTemplateId={clientTemplate.id}
        />
      </div>
      <div className="flex flex-1 min-h-0 min-w-0 w-full">
        <div className="flex flex-col flex-1 min-h-0 min-w-0 max-w-2xl mx-auto">
          <Conversation className="flex-1 min-h-0">
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
                placeholder="Reply to continue…"
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

        <div className="hidden lg:block w-80 shrink-0 h-full">
          <OrchestratorStatusPanel
            state={orchestratorState}
            clientTemplate={clientTemplate}
          />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Legacy: topic chips + plain chat. Preserved byte-for-byte from pre-SPEC-2.
// ──────────────────────────────────────────────────────────────────────

function LegacyInterview({
  interview,
  clientTemplate,
  onExtracted,
  onSwitchToManual,
}: InterviewClientProps) {
  const [input, setInput] = useState("");
  const [isExtracting, startExtraction] = useTransition();
  const [topicsCovered, setTopicsCovered] = useState<string[]>(
    interview.topics_covered,
  );

  const storedMessages = interview.messages as UIMessage[];
  const openingText = interview.is_refresh
    ? clientTemplate.refreshOpeningMessage
    : clientTemplate.openingMessage;
  const initialMessages =
    storedMessages.length > 0 ? storedMessages : [buildOpening(openingText)];

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
    <div className="flex flex-col h-[calc(100dvh-8rem)] min-h-0 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
        {clientTemplate.topics.map((topic) => {
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
                {clientTemplate.topicLabels[topic]}
              </span>
            </div>
          );
        })}
      </div>

      <Conversation className="flex-1 min-h-0">
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
