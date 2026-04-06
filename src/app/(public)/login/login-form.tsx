"use client";

import { useState, useTransition } from "react";
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
          <input
            className="input"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn-primary w-full flex items-center justify-center"
          disabled={isPending}
        >
          {isPending ? "Sending…" : "Email me a magic link"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-[var(--color-text-subtle)]">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        or
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        className="btn-ghost w-full border border-[var(--color-border)]"
        disabled={isPending}
      >
        Continue with Google
      </button>

      {message && (
        <p className="text-sm text-[var(--color-success)]">{message}</p>
      )}
      {errorMessage && (
        <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p>
      )}
    </div>
  );
}
