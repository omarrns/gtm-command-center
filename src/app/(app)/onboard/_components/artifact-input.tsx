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
import { cn } from "@/lib/utils";
import { CyclicLoader } from "@/components/ui/cyclic-loader";
import type {
  OnboardingArtifactRow,
  OnboardingArtifactStatus,
} from "@/lib/supabase/types";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";
import type {
  ClientInterviewTemplate,
  InterviewTemplateId,
} from "@/lib/onboarding/templates/types";
import {
  defaultFileKind,
  defaultTextKind,
  detectKindFromUrl,
} from "@/lib/onboarding/templates/artifact-kind";

interface ArtifactResponse {
  artifact: OnboardingArtifactRow;
  orchestratorState: OrchestratorState | null;
}

interface BatchArtifactResponse {
  artifacts: OnboardingArtifactRow[];
  orchestratorState: OrchestratorState | null;
}

interface ErrorResponse {
  error: string;
}

async function extractErrorMessage(res: Response): Promise<string> {
  let message = `Server returned ${res.status}`;
  try {
    const body = (await res.json()) as Partial<ErrorResponse>;
    if (body.error) message = body.error;
  } catch {
    // fall through
  }
  return message;
}

async function readArtifactResponse(res: Response): Promise<ArtifactResponse> {
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as ArtifactResponse;
}

async function readBatchArtifactResponse(
  res: Response,
): Promise<BatchArtifactResponse> {
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as BatchArtifactResponse;
}

interface ArtifactInputProps {
  interviewId: string;
  clientTemplate: ClientInterviewTemplate;
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

// Accepts `https://linkedin.com/in/foo`, `linkedin.com/in/foo`, and
// `www.linkedin.com/in/foo`. Returns the normalized URL or null for things
// that should be treated as pasted text (multi-word resume snippets, etc.).
function parseUrlLike(value: string): string | null {
  const v = value.trim();
  if (!v || /\s/.test(v) || v.length > 500) return null;
  const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Splits the input on whitespace/commas and runs each token through
// parseUrlLike. Returns the normalized URL list only when every token is a
// URL AND there are at least two — so single URLs fall to parseUrlLike and
// mixed text + URL pastes still land as text.
function parseUrlLikeBatch(value: string): string[] | null {
  const tokens = value.split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const urls: string[] = [];
  for (const token of tokens) {
    const url = parseUrlLike(token);
    if (!url) return null;
    urls.push(url);
  }
  return urls;
}

// Kind resolution for URLs / text / files is driven by the template's
// ArtifactKindContract (see @/lib/onboarding/templates/artifact-kind).
// Adding a new template = defining a new contract, no edits here.

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
  clientTemplate,
  onStateUpdated,
  onReadyToChat,
}: ArtifactInputProps) {
  const templateId = clientTemplate.id;
  const artifactContract = clientTemplate.artifactKindContract;
  const [inputValue, setInputValue] = useState("");
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [isUploading, startUpload] = useTransition();
  // ICP-only: pill-driven kind override. Cleared after each submit.
  // Lets the "Bad-fit URL" pill flag the next submit as
  // negative_example without needing a separate input mode. job_search
  // pills don't touch this — their hints just prefill the textarea.
  const [kindOverride, setKindOverride] = useState<string | null>(null);
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
    const submitted = value;
    const normalizedUrl = parseUrlLike(value);
    const batchUrls = normalizedUrl ? null : parseUrlLikeBatch(value);
    const override = kindOverride;
    startUpload(async () => {
      try {
        if (batchUrls) {
          const items = batchUrls.map((u) => ({
            url: u,
            kind: override ?? detectKindFromUrl(u, artifactContract),
          }));
          const res = await fetch("/api/onboard/artifacts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ interviewId, urls: items }),
          });
          const data = await readBatchArtifactResponse(res);
          setArtifacts((prev) => [...prev, ...data.artifacts]);
          setInputValue((curr) => (curr.trim() === submitted ? "" : curr));
          if (textareaRef.current) textareaRef.current.style.height = "auto";
          if (data.orchestratorState) onStateUpdated(data.orchestratorState);
          const failures = data.artifacts.filter((a) => a.status === "failed");
          if (failures.length > 0) {
            toast.warning(
              failures.length === data.artifacts.length
                ? "All uploads failed. Try pasting text or uploading PDFs instead."
                : `${failures.length} of ${data.artifacts.length} URLs failed — see chips for details.`,
            );
          }
          if (data.artifacts.some((a) => a.status === "succeeded")) {
            onReadyToChat();
          }
          return;
        }

        const resolvedKind = normalizedUrl
          ? (override ?? detectKindFromUrl(normalizedUrl, artifactContract))
          : (override ?? defaultTextKind(artifactContract));
        const body = normalizedUrl
          ? { interviewId, kind: resolvedKind, url: normalizedUrl }
          : { interviewId, kind: resolvedKind, text: value };

        const res = await fetch("/api/onboard/artifacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await readArtifactResponse(res);
        setArtifacts((prev) => [...prev, data.artifact]);
        // Only wipe the textarea if the user hasn't started composing
        // the next paste while this request was in flight.
        setInputValue((curr) => (curr.trim() === submitted ? "" : curr));
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        if (data.orchestratorState) onStateUpdated(data.orchestratorState);
        if (data.artifact.status === "failed" && data.artifact.error_message) {
          toast.warning(data.artifact.error_message);
        }
        if (data.artifact.status === "succeeded") {
          onReadyToChat();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.error(msg);
      } finally {
        setKindOverride(null);
      }
    });
  }

  async function submitFile(file: File) {
    if (!file) return;
    if (isUploading) {
      toast.info("Hang on — finishing the previous upload");
      return;
    }
    const override = kindOverride;
    startUpload(async () => {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("interviewId", interviewId);
        form.append(
          "kind",
          override ?? defaultFileKind(artifactContract, file.name),
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
        if (data.artifact.status === "succeeded") {
          onReadyToChat();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.error(msg);
      } finally {
        setKindOverride(null);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const hasLinkedInFailure = artifacts.some(
    (a) =>
      a.status === "failed" &&
      (a.source_url ?? "").toLowerCase().includes("linkedin.com"),
  );

  const copy = buildCopy(templateId);

  // Pill click may prefill the textarea (hint), trigger a side effect
  // (action), AND/OR set the kind override for the next submit. ICP
  // uses the override to tag negative exemplars; job_search doesn't
  // need it.
  const pills: Array<{
    label: string;
    hint?: string;
    action?: () => void;
    kindOverride?: string;
  }> =
    templateId === "icp_definition"
      ? [
          {
            label: "Good-fit customer URL",
            hint: "https://",
            kindOverride: "positive_example",
          },
          {
            label: "Bad-fit URL",
            hint: "https://",
            kindOverride: "negative_example",
          },
          {
            label: "Buyer LinkedIn",
            hint: "https://linkedin.com/in/",
            kindOverride: "buyer_persona",
          },
          {
            label: "Upload deck",
            action: () => fileRef.current?.click(),
            kindOverride: "company_context",
          },
        ]
      : [
          { label: "LinkedIn URL", hint: "https://linkedin.com/in/" },
          { label: "Paste resume", hint: "" },
          { label: "Upload PDF", action: () => fileRef.current?.click() },
        ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12">
      {/* Hero heading */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          {copy.heroTitle}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm leading-relaxed">
          {copy.heroSubtitle}
        </p>
      </div>

      {isUploading && (
        <CyclicLoader messages={copy.cyclicMessages} className="mb-3" />
      )}

      {/* Artifact chips */}
      {artifacts.length > 0 && (
        <div className="w-full max-w-lg mb-3">
          <div className="flex flex-wrap gap-2">
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
          {hasLinkedInFailure && (
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              {copy.linkedInFailureHint}
            </p>
          )}
          {kindOverride && (
            <p className="text-xs text-[var(--color-blue)] mt-2">
              Next submission will be tagged as{" "}
              <strong>{humanizeKind(kindOverride)}</strong>.
            </p>
          )}
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
          placeholder={copy.placeholder}
          rows={3}
          className="w-full bg-transparent px-4 pt-4 pb-2 text-sm resize-none outline-none placeholder:text-[var(--color-text-subtle)] min-h-[88px] max-h-[200px]"
        />
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
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
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) submitFile(file);
          e.target.value = "";
        }}
      />

      {/* Quick action pills */}
      <div className="flex items-center gap-2 mt-6 flex-wrap justify-center">
        {pills.map((pill) => (
          <button
            key={pill.label}
            type="button"
            onClick={() => {
              // Set override BEFORE firing the action, so a pill that
              // both opens the file dialog (e.g. "Upload deck") and
              // carries a kind override tags the next upload correctly.
              if (pill.kindOverride) {
                setKindOverride(pill.kindOverride);
              }
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
    </div>
  );
}

// ── Copy ────────────────────────────────────────────────────────────────────

interface InputCopy {
  heroTitle: string;
  heroSubtitle: string;
  placeholder: string;
  cyclicMessages: string[];
  linkedInFailureHint: string;
}

function buildCopy(templateId: InterviewTemplateId): InputCopy {
  if (templateId === "icp_definition") {
    return {
      heroTitle: "Let's find you customers",
      heroSubtitle:
        "Drop customers you'd clone, bad-fit examples, or your product context. The more exemplars I see, the sharper the ICP rubric gets before the first question.",
      placeholder:
        "Paste a customer URL, a buyer's LinkedIn, or describe your product and target accounts…",
      cyclicMessages: [
        "Reading your exemplars…",
        "Spotting firmographic patterns…",
        "Mapping the buyer committee…",
        "Building the rubric before the first question…",
      ],
      linkedInFailureHint:
        "LinkedIn often blocks automated reads. Try pasting the profile text or uploading a relevant PDF instead.",
    };
  }
  return {
    heroTitle: "Help me, help you.",
    heroSubtitle:
      "Drop a LinkedIn URL, paste your resume, or upload a PDF. The more context you share, the smarter the agent gets before it asks you anything.",
    placeholder:
      "Drop a LinkedIn URL, paste your resume, or describe what you're looking for…",
    cyclicMessages: [
      "Reading your career history…",
      "Spotting your strongest signals…",
      "Mapping your positioning…",
      "Building context before the first question…",
    ],
    linkedInFailureHint:
      "LinkedIn often blocks automated reads. Try pasting your profile text or uploading your resume PDF instead.",
  };
}

function humanizeKind(kind: string): string {
  const map: Record<string, string> = {
    positive_example: "good-fit customer",
    negative_example: "bad-fit example",
    buyer_persona: "buyer persona",
    company_context: "company context",
  };
  return map[kind] ?? kind.replace(/_/g, " ");
}
