"use client";

import { useState, useRef, useEffect } from "react";
import { X, Sparkles, ArrowUp } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SalesCall } from "@/lib/calls/types";

interface MultiChatModalProps {
  calls: SalesCall[];
  onClose: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What patterns appear across these calls?",
  "What's the most common objection?",
  "Draft a single follow-up that references all of them",
];

export function MultiChatModal({ calls, onClose }: MultiChatModalProps) {
  const count = calls.length;
  const plural = count === 1 ? "" : "s";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current && messages.length > 0) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `Multi-call chat is a UI preview. Connect a Claude endpoint with the ${count} selected transcript${plural} as context to enable real cross-call analysis.`,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl h-[80vh] overflow-hidden p-0 gap-0 flex flex-col"
      >
        <div className="px-6 pt-5 pb-4 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles
                size={14}
                className="text-[var(--color-blue)] shrink-0"
              />
              <DialogTitle className="text-base font-semibold">
                Chat with {count} transcript{plural}
              </DialogTitle>
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

          <div className="flex flex-wrap gap-1.5">
            {calls.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-surface-muted)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                <span className="font-medium truncate max-w-[200px]">
                  {c.title}
                </span>
                <span className="text-[var(--color-text-subtle)]">·</span>
                <span className="text-[var(--color-text-muted)]">
                  {c.account}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Sparkles
                size={32}
                className="text-[var(--color-text-subtle)] mb-3"
              />
              <p className="text-sm font-medium text-[var(--color-text)]">
                Chat across these {count} call{plural}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 mb-6 max-w-sm leading-relaxed">
                Spot patterns across transcripts, find common objections, or
                draft a single follow-up that references all of them.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] transition-colors duration-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-3 shrink-0">
          <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 focus-within:border-[var(--color-blue)] transition-colors duration-100">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={`Ask anything about these ${count} call${plural}…`}
              rows={1}
              className="flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 px-1.5 py-1.5 text-sm min-h-[36px] max-h-32"
            />
            <Button
              size="icon-sm"
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="shrink-0 h-8 w-8"
            >
              <ArrowUp size={14} />
              <span className="sr-only">Send</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--color-blue)] text-white px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 mt-0.5 h-6 w-6 rounded-full bg-[var(--color-surface-muted)] flex items-center justify-center">
        <Sparkles size={12} className="text-[var(--color-blue)]" />
      </div>
      <div className="flex-1 max-w-[80%] text-sm text-[var(--color-text)] leading-relaxed pt-0.5">
        {message.content}
      </div>
    </div>
  );
}
