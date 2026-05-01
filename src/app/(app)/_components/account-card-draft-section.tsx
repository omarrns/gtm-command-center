interface AccountCardDraftSectionProps {
  latestDraft: {
    subject: string;
    body: string;
  };
}

export function AccountCardDraftSection({
  latestDraft,
}: AccountCardDraftSectionProps) {
  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
      <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-2">
        Draft email
      </h4>
      <div className="rounded-md bg-[var(--color-surface-muted)] p-3 space-y-2">
        <p className="font-mono text-xs font-semibold break-words">
          {latestDraft.subject}
        </p>
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-sans text-[var(--color-text-muted)]">
          {latestDraft.body}
        </pre>
      </div>
    </div>
  );
}
