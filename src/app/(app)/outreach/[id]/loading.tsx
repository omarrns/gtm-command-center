export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 bg-[var(--color-surface-muted)] rounded-md" />
        <div>
          <div className="h-6 w-56 bg-[var(--color-surface-muted)] rounded-md" />
          <div className="h-3 w-32 bg-[var(--color-surface-muted)] rounded-md mt-2" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="surface p-4 h-10" />
        <div className="surface p-4 h-72" />
      </div>
    </div>
  );
}
