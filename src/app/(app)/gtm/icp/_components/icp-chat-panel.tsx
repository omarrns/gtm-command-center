"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowSquareOut,
  GitPullRequest,
  Plus,
  Spinner,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

function extractDisplayText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

function isEditableElement(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  return (
    element.isContentEditable ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function useRefocusTextarea(status: string, isStreaming: boolean) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status !== "ready" || isStreaming) return;
    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea || textarea.disabled) return;
      const activeElement = document.activeElement;
      if (activeElement !== document.body && isEditableElement(activeElement)) {
        return;
      }
      textarea.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [status, isStreaming]);

  return textareaRef;
}

export function IcpChatPanel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createSession(shouldCancel: () => boolean) {
    const res = await fetch("/api/icp/chat/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: "account_prep" }),
    });
    const data = (await res.json()) as { sessionId?: string; error?: string };
    if (shouldCancel()) return;
    if (!res.ok || !data.sessionId) {
      setError(data.error ?? "Failed to start ICP chat");
      return;
    }
    setError(null);
    setSessionId(data.sessionId);
  }

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      createSession(() => cancelled).catch(() => {
        if (!cancelled) setError("Failed to start ICP chat");
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] p-6 text-sm text-[var(--color-text-muted)]">
        {error}
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
        Starting ICP chat...
      </div>
    );
  }

  return (
    <ActiveIcpChat
      key={sessionId}
      sessionId={sessionId}
      onStartNew={() => void createSession(() => false)}
    />
  );
}

function ActiveIcpChat({
  sessionId,
  onStartNew,
}: {
  sessionId: string;
  onStartNew: () => void;
}) {
  const [input, setInput] = useState("");
  const [isSubmittedForReview, setIsSubmittedForReview] = useState(false);
  const [isCompleting, startComplete] = useTransition();

  const { messages, sendMessage, status } = useChat({
    id: sessionId,
    messages: [],
    transport: new DefaultChatTransport({
      api: "/api/icp/chat",
      body: { sessionId },
    }),
  });

  const isSubmitted = status === "submitted";
  const isStreaming = isSubmitted || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistant = isSubmitted && lastMessage?.role === "user";
  const textareaRef = useRefocusTextarea(status, isStreaming);
  const isLocked = isSubmittedForReview || isCompleting;

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text?.trim();
    if (!text || isStreaming || isLocked) return;
    setInput("");
    sendMessage({ text });
  }

  function recommendRubricChange() {
    startComplete(async () => {
      const res = await fetch(`/api/icp/chat/sessions/${sessionId}/complete`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit rubric recommendation");
        return;
      }
      setIsSubmittedForReview(true);
      toast.success("Rubric recommendation queued for review");
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-1 min-h-0 min-w-0 w-full pb-4">
        <div className="flex flex-col flex-1 min-h-0 min-w-0 max-w-3xl mx-auto">
          <Conversation className="flex-1 min-h-0">
            <ConversationContent className="max-w-3xl mx-auto w-full">
              {isSubmittedForReview ? (
                <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      This session is queued for ICP rubric review. The agents
                      will log their decision in Changes.
                    </span>
                    <Link
                      href="/gtm/icp?view=changes"
                      className="inline-flex items-center gap-1 font-medium text-[var(--color-text)]"
                    >
                      View Changes
                      <ArrowSquareOut size={14} />
                    </Link>
                  </div>
                </div>
              ) : null}
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--color-text-muted)]">
                  Ask about an account, paste call context, pressure-test a fit
                  concern, or tell the ICP what it should learn.
                </div>
              ) : null}
              {messages.map((message) => {
                const text = extractDisplayText(message);
                if (!text) return null;
                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.role === "assistant" ? (
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

          <div className="px-4 pt-2 shrink-0">
            <PromptInput
              onSubmit={handleSubmit}
              className="bg-card border border-[var(--color-border-strong)] shadow-sm rounded-xl overflow-hidden focus-within:border-[var(--color-blue)] focus-within:ring-2 focus-within:ring-[var(--color-blue-muted)] transition-colors"
            >
              <PromptInputTextarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  isSubmittedForReview
                    ? "This session has been submitted for rubric review"
                    : "Talk to your ICP..."
                }
                disabled={isStreaming || isLocked}
                className="bg-transparent border-0 focus-visible:ring-0 focus-visible:border-0"
              />
              <PromptInputFooter className="bg-[var(--color-surface-muted)] border-t border-[var(--color-border)]">
                <div className="flex w-full items-center justify-between gap-2">
                  {isSubmittedForReview ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onStartNew}
                      className="h-8 text-xs text-[var(--color-text-muted)]"
                    >
                      <Plus size={14} />
                      Start New Chat
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={recommendRubricChange}
                      disabled={isCompleting || messages.length === 0}
                      className="h-8 text-xs"
                    >
                      {isCompleting ? (
                        <Spinner size={14} className="animate-spin" />
                      ) : (
                        <GitPullRequest size={14} />
                      )}
                      Recommend ICP Rubric Change
                    </Button>
                  )}
                  {isSubmittedForReview ? (
                    <Link
                      href="/gtm/icp?view=changes"
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "h-8 text-xs",
                      )}
                    >
                      <ArrowSquareOut size={14} />
                      Changes
                    </Link>
                  ) : (
                    <PromptInputSubmit
                      status={status}
                      disabled={!input.trim() || isStreaming || isLocked}
                      className="bg-[var(--color-blue)] text-white hover:bg-[var(--color-blue)]/90 disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-subtle)]"
                    />
                  )}
                </div>
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
