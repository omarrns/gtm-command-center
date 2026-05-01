import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REFRESH_HREF = "/onboard?mode=refresh&template=icp_definition";

interface IcpNarrativePanelProps {
  narrativeArc: string | null;
}

interface NarrativeBlock {
  title: string;
  body: string;
}

export function IcpNarrativePanel({ narrativeArc }: IcpNarrativePanelProps) {
  const blocks = parseNarrativeBlocks(narrativeArc);

  if (blocks.length === 0) {
    return (
      <Card className="border-dashed bg-muted/40 py-10">
        <CardContent className="space-y-4 text-center">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Narrative arc not generated yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Finish the narrative step after ICP review to create the buyer
              story that powers messaging and outreach.
            </p>
          </div>
          <Link href={REFRESH_HREF} className={buttonVariants({ size: "sm" })}>
            Continue onboarding
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <Card key={block.title}>
          <CardHeader>
            <CardTitle>{block.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <NarrativeBody value={block.body} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function parseNarrativeBlocks(content: string | null): NarrativeBlock[] {
  const markdown = content?.trim() ?? "";
  if (!markdown) return [];

  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  if (headings.length === 0) {
    return [{ title: "Narrative", body: markdown }];
  }

  return headings
    .map((heading, index) => {
      const next = headings[index + 1];
      const start = (heading.index ?? 0) + heading[0].length;
      const end = next?.index ?? markdown.length;
      return {
        title: heading[1]?.trim() ?? "Narrative",
        body: markdown.slice(start, end).replace(/\n---\s*$/g, "").trim(),
      };
    })
    .filter((block) => block.body);
}

function NarrativeBody({ value }: { value: string }) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "---");

  return (
    <div className="space-y-2">
      {lines.map((line, index) =>
        line.startsWith("- ") ? (
          <div
            key={`${line}-${index}`}
            className="flex gap-2 text-sm leading-relaxed text-[var(--color-text)]"
          >
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/30" />
            <span>{line.slice(2)}</span>
          </div>
        ) : (
          <p
            key={`${line}-${index}`}
            className="text-sm leading-relaxed text-[var(--color-text)]"
          >
            {line}
          </p>
        ),
      )}
    </div>
  );
}
