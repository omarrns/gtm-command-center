"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { draftIcpAccountOutreachAction } from "../actions";

interface DraftResult {
  subject: string;
  body: string;
  reasoning: string;
}

export function DraftForm() {
  const [isPending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState("");
  const [buyerDescription, setBuyerDescription] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDraft(null);
    startTransition(async () => {
      const result = await draftIcpAccountOutreachAction({
        companyName,
        buyerDescription,
        extraContext,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(result.data);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block">
        <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
          Company
        </span>
        <Input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Corp"
          required
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
          Buyer
        </span>
        <Textarea
          value={buyerDescription}
          onChange={(e) => setBuyerDescription(e.target.value)}
          placeholder="VP Sales who owns outbound pipeline quality after a recent growth push."
          required
          className="min-h-28"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">
          Extra context
        </span>
        <Textarea
          value={extraContext}
          onChange={(e) => setExtraContext(e.target.value)}
          placeholder="Optional account signal, recent hiring note, or product angle."
          className="min-h-24"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Drafting..." : "Generate draft"}
        </Button>
        {isPending && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Grounding in your narrative arc...
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Draft failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {draft && (
        <Card className="bg-muted gap-3 p-4">
          <div>
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Subject
            </p>
            <p className="font-mono text-sm font-semibold">{draft.subject}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Body
            </p>
            <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans">
              {draft.body}
            </pre>
          </div>
          {draft.reasoning && (
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
              {draft.reasoning}
            </p>
          )}
        </Card>
      )}
    </form>
  );
}
