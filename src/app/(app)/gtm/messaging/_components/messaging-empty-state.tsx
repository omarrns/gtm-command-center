import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GenerateIcpNarrativeButton } from "../../_components/generate-icp-narrative-button";

interface MessagingEmptyStateProps {
  hasRubric: boolean;
  hasActiveIcpReview: boolean;
}

export function MessagingEmptyState({
  hasRubric,
  hasActiveIcpReview,
}: MessagingEmptyStateProps) {
  if (hasActiveIcpReview) {
    return (
      <EmptyCard
        title="Finish ICP review to create your story"
        description="Your ICP is still in review. Finish that step, then the app will generate and save the buyer narrative arc."
      >
        <Link href="/gtm/icp" className={cn(buttonVariants({ size: "sm" }))}>
          Finish ICP review
        </Link>
      </EmptyCard>
    );
  }

  if (hasRubric) {
    return (
      <EmptyCard
        title="Your ICP exists, but the buyer story is missing"
        description="Generate the narrative arc from your saved ICP, then this page can render channel hooks from the same saved story."
      >
        <GenerateIcpNarrativeButton />
      </EmptyCard>
    );
  }

  return (
    <EmptyCard
      title="No messaging system generated yet"
      description="This page fills in after GTM onboarding writes your ICP, proof, disqualifiers, and buyer narrative arc."
    >
      <Link
        href="/gtm/icp?mode=refresh"
        className={cn(buttonVariants({ size: "sm" }))}
      >
        Refresh onboarding
      </Link>
      <Link
        href="/gtm/icp"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        View ICP
      </Link>
    </EmptyCard>
  );
}

function EmptyCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-dashed bg-muted/40 py-10">
      <CardContent className="mx-auto max-w-xl space-y-4 text-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">{children}</div>
      </CardContent>
    </Card>
  );
}
