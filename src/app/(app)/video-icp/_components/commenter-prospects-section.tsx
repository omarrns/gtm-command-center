import Link from "next/link";
import type { ProspectRow } from "@/lib/prospects/types";
import {
  dismissProspectAction,
  promoteProspectAction,
  scoreReviewProspectsAction,
} from "../../prospects/actions";

export function CommenterProspectsSection({
  reviewId,
  prospects,
}: {
  reviewId: string;
  prospects: ProspectRow[];
}) {
  const counts = countProspects(prospects);
  const topProspects = prospects.slice(0, 8);

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-[var(--color-text)]">
            Commenter prospects
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {counts.total} extracted · {counts.scored} scored ·{" "}
            {counts.promoted} promoted · {counts.failed} failed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {counts.discovered > 0 && (
            <form action={scoreReviewProspectsAction}>
              <input type="hidden" name="review_id" value={reviewId} />
              <button
                type="submit"
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              >
                Score commenters
              </button>
            </form>
          )}
          <Link
            href="/prospects"
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            Open queue
          </Link>
        </div>
      </div>

      {topProspects.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          No durable commenter prospects were extracted from this review.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-[var(--color-border)]">
          {topProspects.map((prospect) => (
            <ProspectRowItem key={prospect.id} prospect={prospect} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProspectRowItem({ prospect }: { prospect: ProspectRow }) {
  const reason =
    typeof prospect.score_components?.reason === "string"
      ? prospect.score_components.reason
      : null;
  const canPromote =
    prospect.status === "scored" &&
    prospect.company_confidence === "high" &&
    !!prospect.company_domain;

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-[var(--color-text)]">
              {prospect.display_name}
            </p>
            <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs capitalize text-[var(--color-text-muted)]">
              {prospect.status}
            </span>
            {prospect.score != null && (
              <span className="text-xs font-medium text-[var(--color-blue)]">
                {prospect.score}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-muted)]">
            {prospect.comment_text}
          </p>
          {reason && (
            <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
              {reason}
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
            Company: {prospect.company_domain ?? "Needs company"} · Confidence:{" "}
            {prospect.company_confidence}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canPromote ? (
            <form action={promoteProspectAction}>
              <input type="hidden" name="prospect_id" value={prospect.id} />
              <button
                type="submit"
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              >
                Promote
              </button>
            </form>
          ) : (
            <span className="text-xs text-[var(--color-text-subtle)]">
              Needs company
            </span>
          )}
          {prospect.status !== "dismissed" && (
            <form action={dismissProspectAction}>
              <input type="hidden" name="prospect_id" value={prospect.id} />
              <button
                type="submit"
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Dismiss
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function countProspects(prospects: ProspectRow[]) {
  return {
    total: prospects.length,
    discovered: prospects.filter((p) => p.status === "discovered").length,
    scored: prospects.filter((p) => p.status === "scored").length,
    promoted: prospects.filter((p) => p.status === "promoted").length,
    failed: prospects.filter((p) => p.last_error).length,
  };
}
