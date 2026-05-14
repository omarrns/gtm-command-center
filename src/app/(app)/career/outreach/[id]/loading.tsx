import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="flex-1">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-40 mt-1" />
        </div>
      </div>
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
