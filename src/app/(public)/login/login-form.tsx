"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMagicLinkAction, signInWithGoogleAction } from "./actions";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    error ?? null,
  );
  const [isPending, startTransition] = useTransition();

  function onMagicLink(formData: FormData) {
    setMessage(null);
    setErrorMessage(null);
    startTransition(async () => {
      const result = await sendMagicLinkAction(formData);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        setMessage("Check your inbox for a sign-in link.");
      }
    });
  }

  function onGoogle() {
    startTransition(async () => {
      await signInWithGoogleAction(next);
    });
  }

  return (
    <div className="space-y-4">
      <form action={onMagicLink} className="space-y-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">
            Email
          </span>
          <Input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Sending…" : "Email me a magic link"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-[var(--color-text-subtle)]">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        or
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogle}
        disabled={isPending}
      >
        Continue with Google
      </Button>

      {message && (
        <p className="text-sm text-[var(--color-success)]">{message}</p>
      )}
      {errorMessage && (
        <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p>
      )}
    </div>
  );
}
