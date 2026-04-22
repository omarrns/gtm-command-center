"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel surfaces error.digest in Function logs — logging it here lets
    // a user-reported error.digest be cross-referenced with the server stack.
    console.error(
      `[app/error] ${error.digest ? `digest=${error.digest} ` : ""}${error.message}`,
      error,
    );
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6 max-w-md">
        {error.message || "An unexpected error occurred."}
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--color-text-subtle)] mb-6 font-mono">
          Error ID: {error.digest}
        </p>
      ) : null}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
