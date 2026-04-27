import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Result-card-shaped placeholder used during long async searches.
// Mirrors the real OpportunityCard / AccountCard footprint: title + stage badge,
// location/source meta line, two-line analysis summary, and a score chip on
// the right. Inner Skeletons pulse via the shadcn primitive.

interface ResultCardSkeletonProps {
  className?: string;
}

export function ResultCardSkeleton({ className }: ResultCardSkeletonProps) {
  return (
    <Card
      aria-hidden="true"
      className={cn("flex-row items-start gap-4 p-4 sm:p-5", className)}
    >
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="h-3 w-1/3" />
        <div className="space-y-1.5 pt-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
      <Skeleton className="h-7 w-11 rounded-md shrink-0" />
    </Card>
  );
}
