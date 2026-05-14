"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithPasswordAction, signInWithGoogleAction } from "./actions";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    error ?? null,
  );
  const [isPending, startTransition] = useTransition();

  function onPasswordSignIn(formData: FormData) {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await signInWithPasswordAction(formData);
      if (result.error) {
        setErrorMessage(result.error);
        return;
      }
      router.replace(result.next ?? "/");
      router.refresh();
    });
  }

  function onGoogle() {
    startTransition(async () => {
      await signInWithGoogleAction(next);
    });
  }

  return (
    <div className="space-y-4">
      <form action={onPasswordSignIn} className="space-y-3">
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
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">
            Password
          </span>
          <Input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
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

      {errorMessage && (
        <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p>
      )}
    </div>
  );
}
