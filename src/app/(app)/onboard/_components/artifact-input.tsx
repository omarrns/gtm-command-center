"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle,
  WarningCircle,
  Paperclip,
  ArrowUp,
  Spinner,
} from "@phosphor-icons/react/ssr";
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
import { parseUrlLike, parseUrlLikeBatch } from "@/lib/onboarding/url-paste";
import { getOrchestratorStateAction } from "../interview-actions";

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
  initialOrchestratorState?: OrchestratorState | null;
  onStateUpdated: (state: OrchestratorState) => void;
  onReadyToChat: () => void;
}

type ArtifactListItem = Pick<
  OnboardingArtifactRow,
  | "id"
  | "kind"
  | "source_label"
  | "source_type"
  | "source_url"
  | "file_name"
  | "status"
  | "error_message"
>;

// Kind resolution for URLs / text / files is driven by the template's
// ArtifactKindContract (see @/lib/onboarding/templates/artifact-kind).
// Adding a new template = defining a new contract, no edits here.

function statusIcon(status: OnboardingArtifactStatus) {
  if (status === "succeeded")
    return (
      <CheckCircle
        size={12}
        className="text-[var(--color-success)] shrink-0"
      />
    );
  if (status === "failed")
    return (
      <WarningCircle size={12} className="text-[var(--color-danger)] shrink-0" />
    );
  return (
    <Spinner
      size={12}
      className="animate-spin text-[var(--color-blue)] shrink-0"
    />
  );
}

function artifactLabel(a: ArtifactListItem): string {
  if (a.source_url) return a.source_url;
  if (a.file_name) return a.file_name;
  if (a.source_label) return a.source_label;
  return `${a.kind} (text)`;
}

export function ArtifactInput({
  interviewId,
  clientTemplate,
  initialOrchestratorState = null,
  onStateUpdated,
  onReadyToChat,
}: ArtifactInputProps) {
  const templateId = clientTemplate.id;
  const artifactContract = clientTemplate.artifactKindContract;
  const [inputValue, setInputValue] = useState("");
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>(
    () =>
      initialOrchestratorState?.artifacts.map((a) => ({
        id: a.id,
        kind: a.kind,
        source_label: a.sourceLabel ?? null,
        source_type: a.sourceType,
        source_url: a.sourceUrl ?? null,
        file_name: a.fileName ?? null,
        status: a.status,
        error_message: a.errorMessage ?? null,
      })) ?? [],
  );
  const [isUploading, startUpload] = useTransition();
  const [analysisState, setAnalysisState] = useState<OrchestratorState | null>(
    initialOrchestratorState,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(
    initialOrchestratorState?.status === "failed"
      ? "Artifact analysis failed. Try again or paste text."
      : null,
  );
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

  function handleOrchestratorState(state: OrchestratorState | null) {
    if (!state) return;
    setAnalysisState(state);
    onStateUpdated(state);
    if (state.status !== "failed") {
      setAnalysisError(null);
    }
    if (state.status === "failed") {
      setAnalysisError("Artifact analysis failed. Try again or paste text.");
      return;
    }
    if (canEnterChat(state)) {
      onReadyToChat();
    }
  }

  useEffect(() => {
    if (analysisState?.status !== "analyzing") return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const snapshot = await getOrchestratorStateAction(interviewId);
        if (cancelled) return;
        handleOrchestratorState(snapshot.orchestratorState);
      } catch {
        // transient; next tick retries
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisState?.status, interviewId]);

  async function submit() {
    const value = inputValue.trim();
    if (!value || isUploading || analysisState?.status === "analyzing") return;
    const submitted = value;
    const normalizedUrl = parseUrlLike(value);
    const batchUrls = normalizedUrl ? null : parseUrlLikeBatch(value);
    const override = kindOverride;
    startUpload(async () => {
      try {
        setAnalysisError(null);
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
          handleOrchestratorState(data.orchestratorState);
          const failures = data.artifacts.filter((a) => a.status === "failed");
          if (failures.length > 0) {
            toast.warning(
              failures.length === data.artifacts.length
                ? "All uploads failed. Try pasting text or uploading PDFs instead."
                : `${failures.length} of ${data.artifacts.length} URLs failed — see chips for details.`,
            );
          }
          if (
            !data.orchestratorState &&
            data.artifacts.some((a) => a.status === "succeeded")
          ) {
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
        handleOrchestratorState(data.orchestratorState);
        if (data.artifact.status === "failed" && data.artifact.error_message) {
          toast.warning(data.artifact.error_message);
        }
        if (!data.orchestratorState && data.artifact.status === "succeeded") {
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
    if (isUploading || analysisState?.status === "analyzing") {
      toast.info("Hang on — finishing the previous upload");
      return;
    }
    const override = kindOverride;
    startUpload(async () => {
      try {
        setAnalysisError(null);
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
        handleOrchestratorState(data.orchestratorState);
        if (data.artifact.status === "failed" && data.artifact.error_message) {
          toast.warning(data.artifact.error_message);
        }
        if (!data.orchestratorState && data.artifact.status === "succeeded") {
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
  const isAnalyzing = analysisState?.status === "analyzing";
  const isBusy = isUploading || isAnalyzing;

  // Pill click may prefill the textarea (hint), trigger a side effect
  // (action), AND/OR set the kind override for the next submit. ICP
  // uses the override to tag negative exemplars; job_search doesn't
  // need it.
  const pills: Array<{
    label: string;
    hint?: string;
    action?: "file";
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
            action: "file",
            kindOverride: "company_context",
          },
        ]
      : [
          { label: "LinkedIn URL", hint: "https://linkedin.com/in/" },
          { label: "Paste resume", hint: "" },
          { label: "Upload PDF", action: "file" },
        ];

  return (
    <div className="flex min-h-[52vh] flex-col items-center justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-xl font-semibold tracking-tight">
          {copy.heroTitle}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
          {copy.heroSubtitle}
        </p>
      </div>

      {isBusy && (
        <CyclicLoader messages={copy.cyclicMessages} className="mb-3" />
      )}
      {analysisError && (
        <div className="mb-3 flex w-full max-w-3xl items-center gap-2 rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 text-sm text-[var(--color-danger)]">
          <WarningCircle size={14} className="shrink-0" />
          <span>{analysisError}</span>
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="mb-3 w-full max-w-3xl">
          <div className="flex flex-wrap gap-2">
            {artifacts.map((a) => (
              <div
                key={a.id}
                className="flex max-w-[280px] items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-xs"
              >
                {statusIcon(a.status)}
                <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                  {humanizeKind(a.kind)}
                </span>
                <span className="truncate">{artifactLabel(a)}</span>
                {a.status === "failed" && a.error_message && (
                  <span className="ml-1 truncate text-[var(--color-danger)]">
                    — {a.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
          {hasLinkedInFailure && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              {copy.linkedInFailureHint}
            </p>
          )}
        </div>
      )}

      <div className="w-full max-w-3xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors focus-within:border-[var(--color-blue)]">
        <textarea
          ref={textareaRef}
          value={inputValue}
          disabled={isBusy}
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
            className="rounded-md p-1.5 text-[var(--color-text-subtle)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!inputValue.trim() || isBusy}
            className={cn(
              "rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
              inputValue.trim() && !isBusy
                ? "bg-[var(--color-blue)] text-white hover:opacity-90"
                : "bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)] cursor-not-allowed",
            )}
          >
            {isBusy ? (
              <Spinner size={16} className="animate-spin" />
            ) : (
              <ArrowUp size={16} />
            )}
          </button>
        </div>
      </div>

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

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
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
              if (pill.action === "file") {
                fileRef.current?.click();
                return;
              }
              if (pill.hint !== undefined) {
                setInputValue(pill.hint);
                textareaRef.current?.focus();
              }
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
              pill.kindOverride && kindOverride === pill.kindOverride
                ? "border-[var(--color-blue)] bg-[var(--color-blue)]/5 text-[var(--color-blue)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-blue)] hover:text-[var(--color-blue)]",
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function canEnterChat(state: OrchestratorState): boolean {
  if (state.status === "ready_for_review") return true;
  return state.status === "interviewing" && Boolean(state.nextDimensionKey);
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
      heroTitle: "Build your ICP",
      heroSubtitle:
        "Drop customer examples, bad fits, buyer context, or product notes. I’ll turn them into a sharper rubric before the first question.",
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
