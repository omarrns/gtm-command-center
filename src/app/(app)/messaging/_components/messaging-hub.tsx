import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { GenerateIcpNarrativeButton } from "../../_components/generate-icp-narrative-button";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { cn } from "@/lib/utils";
import { MessagingEmptyState } from "./messaging-empty-state";
import { DocumentPanel } from "./messaging-hub-document-panel";
import { HooksSection, RefreshPlaceholder } from "./messaging-hub-hooks";
import { extractArcBeats } from "./messaging-hub-helpers";

type MemoryDocKey =
  | "company_icp"
  | "icp_proof_points"
  | "icp_disqualifiers"
  | "icp_narrative_arc";

interface MessagingHubProps {
  memoryDocs: Partial<Record<MemoryDocKey, string>>;
  rubric: IcpRubric | null;
  hasActiveIcpReview: boolean;
  hasError: boolean;
}

export function MessagingHub({
  memoryDocs,
  rubric,
  hasActiveIcpReview,
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
        <MessagingEmptyState
          hasRubric={Boolean(rubric)}
          hasActiveIcpReview={hasActiveIcpReview}
        />
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
                rubric ? (
                  <GenerateIcpNarrativeButton variant="outline" />
                ) : (
                  <RefreshPlaceholder>
                    Generate your buyer narrative arc to populate this section.
                  </RefreshPlaceholder>
                )
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
