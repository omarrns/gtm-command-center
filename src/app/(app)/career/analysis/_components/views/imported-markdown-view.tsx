import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Obj } from "../result-guards";

export function ImportedMarkdownView({ result }: { result: Obj }) {
  if (typeof result.raw_markdown !== "string") return null;

  return (
    <div className="space-y-6">
      {result.score != null || result.verdict != null ? (
        <div className="flex items-center gap-3">
          {result.score != null ? (
            <Badge variant="muted">Score: {String(result.score)}</Badge>
          ) : null}
          {result.verdict != null ? (
            <Badge variant="muted">{String(result.verdict)}</Badge>
          ) : null}
        </div>
      ) : null}
      <Card className="p-6">
        <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
          {String(result.raw_markdown)}
        </pre>
      </Card>
    </div>
  );
}
