import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      {/* Page header skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>

      {/* Pipeline funnel skeleton */}
      <Skeleton className="h-16 w-full rounded-lg mb-6" />

      {/* Opportunity cards skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
