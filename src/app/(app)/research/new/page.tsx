import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function NewResearchPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Research"
        description="The research workspace is reserved for standalone analyst workflows."
      />
      <EmptyState
        message="Research creation is not wired yet"
        hint="Existing reports are available from the research workspace."
      >
        <Link href="/research" className={buttonVariants({ size: "sm" })}>
          View Research
        </Link>
      </EmptyState>
    </div>
  );
}
