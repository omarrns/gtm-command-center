import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  parseMarkdownBlocks,
  type MarkdownBlock,
} from "./messaging-hub-helpers";

interface DocumentPanelProps {
  title: string;
  description: string;
  content: string | undefined;
  empty?: ReactNode;
}

export function DocumentPanel({
  title,
  description,
  content,
  empty,
}: DocumentPanelProps) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <Card className="min-h-64">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          {description}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocks.length > 0 ? (
          blocks.map((block) => <DocBlock key={block.title} block={block} />)
        ) : (
          (empty ?? (
            <p className="text-sm text-[var(--color-text-muted)]">
              (not yet generated)
            </p>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DocBlock({ block }: { block: MarkdownBlock }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {block.title}
      </h3>
      <MarkdownLines value={block.body} />
    </section>
  );
}

function MarkdownLines({ value }: { value: string }) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "---");

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => (
        <MarkdownLine key={`${line}-${index}`} line={line} />
      ))}
    </div>
  );
}

function MarkdownLine({ line }: { line: string }) {
  if (line.startsWith("### ")) {
    return (
      <p className="pt-2 text-xs font-medium text-[var(--color-text)]">
        {line.slice(4)}
      </p>
    );
  }

  if (line === "(none)" || line === "(not set)") {
    return <p className="text-sm text-[var(--color-text-muted)]">{line}</p>;
  }

  const labeled = line.match(/^- \*\*(.+?)\*\*: ?(.*)$/);
  if (labeled) {
    return (
      <div className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <span className="text-[var(--color-text-muted)]">{labeled[1]}</span>
        <span className="text-[var(--color-text)]">
          {labeled[2] || "(not set)"}
        </span>
      </div>
    );
  }

  if (line.startsWith("- ")) {
    return (
      <div className="flex gap-2 text-sm leading-relaxed text-[var(--color-text)]">
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--color-text-subtle)]" />
        <span>{line.slice(2)}</span>
      </div>
    );
  }

  return (
    <p className="text-sm leading-relaxed text-[var(--color-text)]">{line}</p>
  );
}
