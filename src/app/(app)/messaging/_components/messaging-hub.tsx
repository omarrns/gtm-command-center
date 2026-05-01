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
  type ArcBeats,
  type HookDerivation,
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

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Messaging"
        description="Your ICP, buyer story, proof, disqualifiers, and channel hooks in one place."
      >
        <Link
          href="/messaging/draft"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
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

      <MarkdownSection title="ICP summary" content={memoryDocs.company_icp} />

      <MarkdownSection
        title="Narrative arc"
        content={memoryDocs.icp_narrative_arc}
        empty={
          <RefreshPlaceholder>
            Generate your buyer narrative arc to populate this section.
          </RefreshPlaceholder>
        }
      />

      <MarkdownSection
        title="Proof points"
        content={memoryDocs.icp_proof_points}
      />

      <MarkdownSection
        title="Disqualifiers"
        content={memoryDocs.icp_disqualifiers}
      />

      <HooksSection arcBeats={arcBeats} rubric={rubric} />
    </div>
  );
}

function MarkdownSection({
  title,
  content,
  empty,
}: {
  title: string;
  content: string | undefined;
  empty?: ReactNode;
}) {
  const body = content?.trim() ?? "";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <Card>
        <CardContent>
          {body ? (
            <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
              {body}
            </pre>
          ) : (
            (empty ?? (
              <p className="text-sm text-muted-foreground">
                (not yet generated)
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </section>
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
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Hooks by channel
        </h2>
        <Card>
          <CardContent>
            <RefreshPlaceholder>
              Generate your buyer narrative arc to populate this section.
            </RefreshPlaceholder>
          </CardContent>
        </Card>
      </section>
    );
  }

  const hooks = [
    {
      title: "Cold email opener",
      hook: deriveColdEmailOpener(arcBeats, rubric),
    },
    {
      title: "Landing hero variant",
      hook: deriveLandingHero(arcBeats, rubric),
    },
    {
      title: "Ad concept seed",
      hook: deriveAdConceptSeed(arcBeats, rubric),
    },
    {
      title: "Sales talk-track snippet",
      hook: deriveSalesTalkTrack(arcBeats),
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">Hooks by channel</h2>
      {rubric === null && (
        <p className="text-xs text-muted-foreground">
          Refresh your ICP onboarding to add rubric overlays.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {hooks.map((item) => (
          <HookCard key={item.title} title={item.title} hook={item.hook} />
        ))}
      </div>
    </section>
  );
}

function HookCard({
  title,
  hook,
}: {
  title: string;
  hook: HookDerivation;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-[var(--color-text)]">
          {hook.primary || "(not enough narrative detail yet)"}
        </p>
        {hook.overlay.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {hook.overlay.map((item) => (
              <li key={item}>- {item}</li>
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
