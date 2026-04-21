"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  FileText,
  Upload,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  OnboardingArtifactRow,
  OnboardingArtifactStatus,
} from "@/lib/supabase/types";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

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

function detectKindFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("linkedin.com")) return "linkedin";
  return "website";
}

function statusIcon(status: OnboardingArtifactStatus) {
  if (status === "succeeded")
    return <CheckCircle2 size={14} className="text-[var(--color-success)]" />;
  if (status === "failed")
    return <AlertCircle size={14} className="text-[var(--color-danger)]" />;
  return (
    <Loader2 size={14} className="animate-spin text-[var(--color-blue)]" />
  );
}

function artifactLabel(a: ArtifactListItem): string {
  if (a.source_url) return a.source_url;
  if (a.file_name) return a.file_name;
  return `${a.kind} (text paste)`;
}

export function ArtifactInput({
  interviewId,
  onStateUpdated,
  onReadyToChat,
}: ArtifactInputProps) {
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [textKind, setTextKind] = useState<"resume" | "pasted_text">(
    "pasted_text",
  );
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [isUploading, startUpload] = useTransition();

  async function submitUrl() {
    const url = urlValue.trim();
    if (!url || isUploading) return;
    startUpload(async () => {
      try {
        const res = await fetch("/api/onboard/artifacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            interviewId,
            kind: detectKindFromUrl(url),
            url,
          }),
        });
        const data = (await res.json()) as {
          artifact: OnboardingArtifactRow;
          orchestratorState: OrchestratorState | null;
        };
        setArtifacts((prev) => [...prev, data.artifact]);
        setUrlValue("");
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

  async function submitText() {
    const text = textValue.trim();
    if (!text || isUploading) return;
    startUpload(async () => {
      try {
        const res = await fetch("/api/onboard/artifacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            interviewId,
            kind: textKind,
            text,
          }),
        });
        const data = (await res.json()) as {
          artifact: OnboardingArtifactRow;
          orchestratorState: OrchestratorState | null;
        };
        setArtifacts((prev) => [...prev, data.artifact]);
        setTextValue("");
        if (data.orchestratorState) onStateUpdated(data.orchestratorState);
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
        const data = (await res.json()) as {
          artifact: OnboardingArtifactRow;
          orchestratorState: OrchestratorState | null;
        };
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

  const hasAnySuccess = artifacts.some((a) => a.status === "succeeded");

  return (
    <div className="mx-auto max-w-2xl w-full space-y-6 py-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          Drop in what you&apos;ve got
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Paste a LinkedIn URL, your personal site, upload a resume — anything
          that helps the agent skip the obvious questions and get to what&apos;s
          actually interesting about you.
        </p>
      </div>

      {/* URL */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--color-text-muted)] flex items-center gap-1.5">
          <LinkIcon size={12} /> URL
        </label>
        <div className="flex gap-2">
          <Input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://linkedin.com/in/you  — or any site that represents you"
            disabled={isUploading}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitUrl();
              }
            }}
          />
          <Button
            type="button"
            onClick={submitUrl}
            disabled={!urlValue.trim() || isUploading}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Text paste */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--color-text-muted)] flex items-center gap-1.5">
          <FileText size={12} /> Paste text
        </label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setTextKind("resume")}
            className={`text-xs px-2 py-1 rounded ${textKind === "resume" ? "bg-[var(--color-blue-muted)] text-[var(--color-blue)]" : "text-[var(--color-text-subtle)]"}`}
          >
            Resume
          </button>
          <button
            type="button"
            onClick={() => setTextKind("pasted_text")}
            className={`text-xs px-2 py-1 rounded ${textKind === "pasted_text" ? "bg-[var(--color-blue-muted)] text-[var(--color-blue)]" : "text-[var(--color-text-subtle)]"}`}
          >
            Freeform
          </button>
        </div>
        <Textarea
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          placeholder={
            textKind === "resume"
              ? "Paste your resume text here..."
              : "Anything: positioning doc, bio, bullets, a paragraph about what you're looking for..."
          }
          rows={4}
          disabled={isUploading}
        />
        <Button
          type="button"
          onClick={submitText}
          disabled={!textValue.trim() || isUploading}
          size="sm"
        >
          Add text
        </Button>
      </div>

      {/* File upload */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--color-text-muted)] flex items-center gap-1.5">
          <Upload size={12} /> Upload PDF
        </label>
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={isUploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) submitFile(file);
            e.target.value = "";
          }}
          className="text-xs text-[var(--color-text-muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-[var(--color-border-strong)] file:bg-[var(--color-surface)] file:text-xs file:cursor-pointer"
        />
      </div>

      {/* Artifact list */}
      {artifacts.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            Added
          </p>
          {artifacts.map((a) => (
            <div key={a.id} className="flex items-start gap-2 text-xs py-1.5">
              {statusIcon(a.status)}
              <div className="flex-1 min-w-0">
                <div className="truncate">{artifactLabel(a)}</div>
                {a.status === "failed" && a.error_message && (
                  <div className="text-[var(--color-danger)] mt-0.5">
                    {a.error_message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proceed */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={onReadyToChat}
          className="text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors"
        >
          Continue without artifacts →
        </button>
        <Button
          type="button"
          onClick={onReadyToChat}
          disabled={!hasAnySuccess || isUploading}
        >
          Start interview
        </Button>
      </div>
    </div>
  );
}
