"use client";

import { useState, useTransition, useRef } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Paperclip,
  ArrowUp,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  OnboardingArtifactRow,
  OnboardingArtifactStatus,
} from "@/lib/supabase/types";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

interface ArtifactResponse {
  artifact: OnboardingArtifactRow;
  orchestratorState: OrchestratorState | null;
}

interface ErrorResponse {
  error: string;
}

async function readArtifactResponse(res: Response): Promise<ArtifactResponse> {
  if (!res.ok) {
    let message = `Server returned ${res.status}`;
    try {
      const body = (await res.json()) as Partial<ErrorResponse>;
      if (body.error) message = body.error;
    } catch {
      // fall through
    }
    throw new Error(message);
  }
  return (await res.json()) as ArtifactResponse;
}

interface ArtifactInputProps {
  interviewId: string;
  onStateUpdated: (state: OrchestratorState) => void;
  onReadyToChat: () => void;
}

type ArtifactListItem = Pick<
  OnboardingArtifactRow,
  | "id"
  | "kind"
  | "source_type"
  | "source_url"
  | "file_name"
  | "status"
  | "error_message"
>;

function isUrl(value: string): boolean {
  return /^https?:\/\//.test(value.trim());
}

function detectKindFromUrl(url: string): string {
  return url.toLowerCase().includes("linkedin.com") ? "linkedin" : "website";
}

function statusIcon(status: OnboardingArtifactStatus) {
  if (status === "succeeded")
    return (
      <CheckCircle2
        size={12}
        className="text-[var(--color-success)] shrink-0"
      />
    );
  if (status === "failed")
    return (
      <AlertCircle size={12} className="text-[var(--color-danger)] shrink-0" />
    );
  return (
    <Loader2
      size={12}
      className="animate-spin text-[var(--color-blue)] shrink-0"
    />
  );
}

function artifactLabel(a: ArtifactListItem): string {
  if (a.source_url) return a.source_url;
  if (a.file_name) return a.file_name;
  return `${a.kind} (text)`;
}

export function ArtifactInput({
  interviewId,
  onStateUpdated,
  onReadyToChat,
}: ArtifactInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [isUploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function submit() {
    const value = inputValue.trim();
    if (!value || isUploading) return;
    startUpload(async () => {
      try {
        const body = isUrl(value)
          ? { interviewId, kind: detectKindFromUrl(value), url: value }
          : { interviewId, kind: "pasted_text", text: value };

        const res = await fetch("/api/onboard/artifacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await readArtifactResponse(res);
        setArtifacts((prev) => [...prev, data.artifact]);
        setInputValue("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        if (data.orchestratorState) onStateUpdated(data.orchestratorState);
        if (data.artifact.status === "failed" && data.artifact.error_message) {
          toast.warning(data.artifact.error_message);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.error(msg);
      }
    });
  }

  async function submitFile(file: File) {
    if (!file || isUploading) return;
    startUpload(async () => {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("interviewId", interviewId);
        form.append(
          "kind",
          file.name.toLowerCase().includes("resume")
            ? "resume"
            : "uploaded_file",
        );
        const res = await fetch("/api/onboard/artifacts", {
          method: "POST",
          body: form,
        });
        const data = await readArtifactResponse(res);
        setArtifacts((prev) => [...prev, data.artifact]);
        if (data.orchestratorState) onStateUpdated(data.orchestratorState);
        if (data.artifact.status === "failed" && data.artifact.error_message) {
          toast.warning(data.artifact.error_message);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.error(msg);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const hasAnySuccess = artifacts.some((a) => a.status === "succeeded");

  const pills: Array<{ label: string; hint?: string; action?: () => void }> = [
    { label: "LinkedIn URL", hint: "https://linkedin.com/in/" },
    { label: "Paste resume", hint: "" },
    { label: "Upload PDF", action: () => fileRef.current?.click() },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12">
      {/* Hero heading */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          Help me, help you.
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm leading-relaxed">
          Drop a LinkedIn URL, paste your resume, or upload a PDF. The more
          context you share, the smarter the agent gets before it asks you
          anything.
        </p>
      </div>

      {/* Artifact chips */}
      {artifacts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 w-full max-w-lg">
          {artifacts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--border)] rounded-full px-3 py-1.5 max-w-[280px]"
            >
              {statusIcon(a.status)}
              <span className="truncate">{artifactLabel(a)}</span>
              {a.status === "failed" && a.error_message && (
                <span className="text-[var(--color-danger)] ml-1 truncate">
                  — {a.error_message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unified input box */}
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] shadow-sm focus-within:border-[var(--color-blue)] transition-colors">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Drop a LinkedIn URL, paste your resume, or describe what you're looking for…"
          disabled={isUploading}
          rows={3}
          className="w-full bg-transparent px-4 pt-4 pb-2 text-sm resize-none outline-none placeholder:text-[var(--color-text-subtle)] min-h-[88px] max-h-[200px]"
        />
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            title="Upload PDF"
            className="p-1.5 rounded-lg text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] transition-colors"
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!inputValue.trim() || isUploading}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              inputValue.trim() && !isUploading
                ? "bg-[var(--color-blue)] text-white hover:opacity-90"
                : "bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)] cursor-not-allowed",
            )}
          >
            {isUploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowUp size={16} />
            )}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={isUploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) submitFile(file);
          e.target.value = "";
        }}
      />

      {/* Quick action pills */}
      <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
        {pills.map((pill) => (
          <button
            key={pill.label}
            type="button"
            onClick={() => {
              if (pill.action) {
                pill.action();
                return;
              }
              if (pill.hint !== undefined) {
                setInputValue(pill.hint);
                textareaRef.current?.focus();
              }
            }}
            className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--color-text-muted)] hover:border-[var(--color-blue)] hover:text-[var(--color-blue)] transition-colors"
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Primary + escape-hatch actions */}
      <div className="flex flex-col items-center gap-3 mt-8">
        {hasAnySuccess && (
          <Button type="button" onClick={onReadyToChat}>
            Start interview
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReadyToChat}
          className="text-[var(--color-text-subtle)]"
        >
          {hasAnySuccess ? "Skip to interview" : "Continue without context"}
        </Button>
      </div>
    </div>
  );
}
