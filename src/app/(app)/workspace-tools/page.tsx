"use client";

import { useState, useTransition } from "react";
import {
  FileText,
  Wrench,
  MessageSquare,
  Smartphone,
  AlertCircle,
} from "lucide-react";
import { generatePromptAction, generateSkillAction } from "./actions";

export default function WorkspaceToolsPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h2 className="text-xl font-semibold">Workspace Tools</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Prompt creation, skill authoring, and workspace utilities.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PromptCreatorCard />
        <SkillCreatorCard />
        <ToolCard
          icon={MessageSquare}
          title="Export Chat"
          description="Export a Claude Code chat transcript as a Markdown artifact."
          status="requires-sync"
        />
        <ToolCard
          icon={Smartphone}
          title="iMessage Export"
          description="Export iMessage transcripts. Desktop-only — requires the local sync bridge."
          status="desktop-only"
        />
      </div>
    </div>
  );
}

function PromptCreatorCard() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    title: string;
    markdown: string;
  } | null>(null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await generatePromptAction(formData);
      if (res.result) setResult(res.result);
    });
  }

  return (
    <div className="surface p-5 col-span-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        <FileText size={16} className="text-[var(--color-accent)]" />
        <div>
          <div className="text-sm font-medium">Create Prompt</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Generate a polished prompt from structured inputs.
          </div>
        </div>
      </button>
      {open && (
        <form action={onSubmit} className="mt-4 space-y-3">
          {["role", "task", "context", "output_format"].map((field) => (
            <label key={field} className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block capitalize">
                {field.replace("_", " ")}
              </span>
              <input
                className="input"
                name={field}
                placeholder={`Describe the ${field.replace("_", " ")}…`}
              />
            </label>
          ))}
          <button
            type="submit"
            className="btn-primary text-xs"
            disabled={isPending}
          >
            {isPending ? "Generating…" : "Generate Prompt"}
          </button>
          {result && (
            <div className="surface-muted p-4 mt-3">
              <div className="text-xs font-medium mb-2">{result.title}</div>
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
                {result.markdown}
              </pre>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function SkillCreatorCard() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    title: string;
    markdown: string;
  } | null>(null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await generateSkillAction(formData);
      if (res.result) setResult(res.result);
    });
  }

  return (
    <div className="surface p-5 col-span-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Wrench size={16} className="text-[var(--color-accent)]" />
        <div>
          <div className="text-sm font-medium">Create Skill</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Generate a Claude Code SKILL.md spec from structured inputs.
          </div>
        </div>
      </button>
      {open && (
        <form action={onSubmit} className="mt-4 space-y-3">
          {["name", "trigger", "tools", "instructions", "output_format"].map(
            (field) => (
              <label key={field} className="block">
                <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block capitalize">
                  {field.replace("_", " ")}
                </span>
                <input
                  className="input"
                  name={field}
                  placeholder={`Describe ${field.replace("_", " ")}…`}
                />
              </label>
            ),
          )}
          <button
            type="submit"
            className="btn-primary text-xs"
            disabled={isPending}
          >
            {isPending ? "Generating…" : "Generate Skill"}
          </button>
          {result && (
            <div className="surface-muted p-4 mt-3">
              <div className="text-xs font-medium mb-2">{result.title}</div>
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
                {result.markdown}
              </pre>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function ToolCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  status: "requires-sync" | "desktop-only";
}) {
  return (
    <div className="surface p-5 opacity-60">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-[var(--color-text-muted)]" />
        <div className="text-sm font-medium">{title}</div>
      </div>
      <div className="text-xs text-[var(--color-text-muted)] mb-3">
        {description}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-warning)]">
        <AlertCircle size={12} />
        {status === "desktop-only"
          ? "Desktop sync bridge required"
          : "Sync bridge not connected"}
      </div>
    </div>
  );
}
