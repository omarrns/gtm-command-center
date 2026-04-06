export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-6 w-32 bg-[var(--color-surface-muted)] rounded-md" />
          <div className="h-4 w-64 bg-[var(--color-surface-muted)] rounded-md mt-2" />
        </div>
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="surface px-5 py-4">
            <div className="h-4 w-48 bg-[var(--color-surface-muted)] rounded-md" />
            <div className="h-3 w-32 bg-[var(--color-surface-muted)] rounded-md mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
