"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6 max-w-md">
        {error.message || "An unexpected error occurred."}
      </p>
      <button type="button" onClick={reset} className="btn-primary text-sm">
        Try again
      </button>
    </div>
  );
}
