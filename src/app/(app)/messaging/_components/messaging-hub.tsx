import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { cn } from "@/lib/utils";
import {
  deriveAdConceptSeed,
  deriveColdEmailOpener,
  deriveLandingHero,
  deriveSalesTalkTrack,
  extractArcBeats,
  parseMarkdownBlocks,
  type ArcBeats,
  type HookDerivation,
  type MarkdownBlock,
} from "./messaging-hub-helpers";

type MemoryDocKey =
  | "company_icp"
  | "icp_proof_points"
  | "icp_disqualifiers"
  | "icp_narrative_arc";

interface MessagingHubProps {
  memoryDocs: Partial<Record<MemoryDocKey, string>>;
  rubric: IcpRubric | null;
  hasError: boolean;
}

export function MessagingHub({
  memoryDocs,
  rubric,
  hasError,
}: MessagingHubProps) {
  const arcMarkdown = memoryDocs.icp_narrative_arc?.trim() ?? "";
  const arcBeats = arcMarkdown ? extractArcBeats(arcMarkdown) : null;
  const hasAnyMessagingDoc = Object.values(memoryDocs).some((doc) =>
    Boolean(doc?.trim()),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <PageHeader
        title="Messaging"
        description="Buyer truth, proof, disqualifiers, and channel hooks in one working canvas."
      >
        <Link
          href="/messaging/draft"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Draft an email
        </Link>
      </PageHeader>

      {hasError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load some sections</AlertTitle>
          <AlertDescription>
            Refresh the page or try again shortly. The error has been logged.
          </AlertDescription>
        </Alert>
      )}

      {!hasAnyMessagingDoc ? (
        <EmptyMessagingSystem />
      ) : (
        <>
          <HooksSection arcBeats={arcBeats} rubric={rubric} />

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <DocumentPanel
              title="ICP summary"
              description="Who you sell to and the signals that matter."
              content={memoryDocs.company_icp}
            />
            <DocumentPanel
              title="Narrative arc"
              description="Why this buyer is in pain now."
              content={memoryDocs.icp_narrative_arc}
              empty={
                <RefreshPlaceholder>
                  Generate your buyer narrative arc to populate this section.
                </RefreshPlaceholder>
              }
            />
            <DocumentPanel
              title="Proof points"
              description="Evidence that supports the message."
              content={memoryDocs.icp_proof_points}
            />
            <DocumentPanel
              title="Disqualifiers"
              description="Accounts and buyers to avoid."
              content={memoryDocs.icp_disqualifiers}
            />
          </div>
        </>
      )}
    </div>
  );
}

function EmptyMessagingSystem() {
  return (
    <Card className="border-dashed bg-muted/40 py-10">
      <CardContent className="mx-auto max-w-xl space-y-4 text-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            No messaging system generated yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This page fills in after GTM onboarding writes your ICP, proof,
            disqualifiers, and buyer narrative arc. Right now there is nothing
            useful to summarize.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href="/onboard?mode=refresh&template=icp_definition"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Refresh onboarding
          </Link>
          <Link
            href="/icp"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            View ICP
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentPanel({
  title,
  description,
  content,
  empty,
}: {
  title: string;
  description: string;
  content: string | undefined;
  empty?: ReactNode;
}) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <Card className="min-h-64">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocks.length > 0 ? (
          blocks.map((block) => <DocBlock key={block.title} block={block} />)
        ) : (
          (empty ?? (
            <p className="text-sm text-muted-foreground">(not yet generated)</p>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DocBlock({ block }: { block: MarkdownBlock }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
    return <p className="text-sm text-muted-foreground">{line}</p>;
  }

  const labeled = line.match(/^- \*\*(.+?)\*\*: ?(.*)$/);
  if (labeled) {
    return (
      <div className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <span className="text-muted-foreground">{labeled[1]}</span>
        <span className="text-[var(--color-text)]">
          {labeled[2] || "(not set)"}
        </span>
      </div>
    );
  }

  if (line.startsWith("- ")) {
    return (
      <div className="flex gap-2 text-sm leading-relaxed text-[var(--color-text)]">
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/30" />
        <span>{line.slice(2)}</span>
      </div>
    );
  }

  return (
    <p className="text-sm leading-relaxed text-[var(--color-text)]">{line}</p>
  );
}

function HooksSection({
  arcBeats,
  rubric,
}: {
  arcBeats: ArcBeats | null;
  rubric: IcpRubric | null;
}) {
  if (!arcBeats) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle>Hooks by channel</CardTitle>
        </CardHeader>
        <CardContent>
          <RefreshPlaceholder>
            Generate your buyer narrative arc to populate channel hooks.
          </RefreshPlaceholder>
        </CardContent>
      </Card>
    );
  }

  const hooks = [
    {
      title: "Cold email",
      label: "Opener",
      hook: deriveColdEmailOpener(arcBeats, rubric),
    },
    {
      title: "Landing page",
      label: "Hero angle",
      hook: deriveLandingHero(arcBeats, rubric),
    },
    {
      title: "Paid ad",
      label: "Concept seed",
      hook: deriveAdConceptSeed(arcBeats, rubric),
    },
    {
      title: "Sales call",
      label: "Talk track",
      hook: deriveSalesTalkTrack(arcBeats),
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Hooks by channel
        </h2>
        <p className="text-sm text-muted-foreground">
          Starting points derived from the buyer narrative, not new AI output.
        </p>
      </div>
      {rubric === null && (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Refresh your ICP onboarding to add rubric overlays.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {hooks.map((item) => (
          <HookCard
            key={item.title}
            title={item.title}
            label={item.label}
            hook={item.hook}
          />
        ))}
      </div>
    </section>
  );
}

function HookCard({
  title,
  label,
  hook,
}: {
  title: string;
  label: string;
  hook: HookDerivation;
}) {
  return (
    <Card size="sm" className="bg-card/80">
      <CardHeader>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-[var(--color-text)]">
          {hook.primary || "Add more narrative detail to make this usable."}
        </p>
        {hook.overlay.length > 0 && (
          <ul className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
            {hook.overlay.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RefreshPlaceholder({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground">
      {children}{" "}
      <Link
        href="/onboard?mode=refresh&template=icp_definition"
        className="underline underline-offset-4 hover:text-foreground"
      >
        Refresh onboarding
      </Link>
    </p>
  );
}
