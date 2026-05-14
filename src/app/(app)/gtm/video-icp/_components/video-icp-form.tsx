"use client";

import { useActionState } from "react";
import {
  Spinner,
  Play,
} from "@phosphor-icons/react/ssr";
import { useFormStatus } from "react-dom";
import {
  createVideoIcpReviewAction,
  type VideoIcpFormState,
} from "../actions";

const INITIAL_STATE: VideoIcpFormState = { error: null };

export function VideoIcpForm() {
  const [state, action] = useActionState(
    createVideoIcpReviewAction,
    INITIAL_STATE,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="youtube_url"
          type="url"
          required
          placeholder="https://www.youtube.com/watch?v=..."
          className="h-10 min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-blue)]"
        />
        <SubmitButton />
      </div>
      {state.error && (
        <p className="text-sm text-[var(--color-danger)]">{state.error}</p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-blue)] px-4 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Spinner size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        <Play size={14} aria-hidden="true" />
      )}
      Review
    </button>
  );
}
