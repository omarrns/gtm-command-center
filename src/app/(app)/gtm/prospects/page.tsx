import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/supabase/server";
import { listProspects } from "@/lib/prospects/youtube";
import type { CompanyConfidence, ProspectRow, ProspectStatus } from "@/lib/prospects/types";
import { dismissProspectAction, promoteProspectAction } from "./actions";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const STATUSES: ProspectStatus[] = [
  "discovered",
  "scored",
  "filtered",
  "promoted",
  "dismissed",
];
const CONFIDENCE: CompanyConfidence[] = ["none", "low", "medium", "high"];
const SOURCES = ["yt_comments"];

export default async function ProspectsPage({ searchParams }: Props) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.user_type !== "gtm") redirect("/");

  const params = await searchParams;
  const prospects = filterProspects(
    await listProspects(svc, user.id),
    normalizeParams(params ?? {}),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospects"
        description="Person-level prospects discovered from YouTube comments before account promotion."
      />
      <ProspectFilters params={normalizeParams(params ?? {})} />
      {prospects.length === 0 ? (
        <EmptyState
          message="No prospects match these filters"
          hint="Score a Video ICP review with fetched comments to populate this queue."
        />
      ) : (
        <div className="max-w-[920px] divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {prospects.map((prospect) => (
            <ProspectQueueRow key={prospect.id} prospect={prospect} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProspectFilters({
  params,
}: {
  params: ReturnType<typeof normalizeParams>;
}) {
  return (
    <form className="flex max-w-[920px] flex-wrap items-end gap-3">
      <SelectFilter name="source" label="Source" value={params.source} values={SOURCES} />
      <SelectFilter name="status" label="Status" value={params.status} values={STATUSES} />
      <SelectFilter
        name="company"
        label="Company confidence"
        value={params.company}
        values={CONFIDENCE}
      />
      <label className="space-y-1 text-xs font-medium text-[var(--color-text-muted)]">
        Min score
        <input
          name="min"
          defaultValue={params.min ?? ""}
          className="h-8 w-24 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm text-[var(--color-text)]"
        />
      </label>
      <label className="space-y-1 text-xs font-medium text-[var(--color-text-muted)]">
        Video
        <input
          name="video"
          defaultValue={params.video ?? ""}
          className="h-8 w-48 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm text-[var(--color-text)]"
        />
      </label>
      <Button type="submit" variant="outline" size="sm">
        Filter
      </Button>
      <Link
        href="/gtm/prospects"
        className="inline-flex h-8 items-center rounded-md px-3 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
      >
        Clear
      </Link>
    </form>
  );
}

function SelectFilter({
  name,
  label,
  value,
  values,
}: {
  name: string;
  label: string;
  value: string | null;
  values: string[];
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-[var(--color-text-muted)]">
      {label}
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-8 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm text-[var(--color-text)]"
      >
        <option value="">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProspectQueueRow({ prospect }: { prospect: ProspectRow }) {
  const reason =
    typeof prospect.score_components?.reason === "string"
      ? prospect.score_components.reason
      : "Not scored yet";
  const canPromote =
    prospect.status === "scored" &&
    prospect.company_confidence === "high" &&
    !!prospect.company_domain;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              {prospect.display_name}
            </h2>
            <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs capitalize text-[var(--color-text-muted)]">
              {prospect.status}
            </span>
            {prospect.score != null && (
              <span className="text-xs font-medium text-[var(--color-blue)]">
                {prospect.score}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{reason}</p>
        </div>
        <div className="flex items-center gap-2">
          {canPromote && (
            <form action={promoteProspectAction}>
              <input type="hidden" name="prospect_id" value={prospect.id} />
              <Button type="submit" variant="outline" size="sm">
                Promote
              </Button>
            </form>
          )}
          {prospect.status !== "dismissed" && (
            <form action={dismissProspectAction}>
              <input type="hidden" name="prospect_id" value={prospect.id} />
              <Button type="submit" variant="ghost" size="sm">
                Dismiss
              </Button>
            </form>
          )}
        </div>
      </div>
      <p className="line-clamp-3 text-sm text-[var(--color-text)]">
        {prospect.comment_text}
      </p>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-subtle)]">
        <span>Company: {prospect.company_domain ?? "Needs company"}</span>
        <span>Confidence: {prospect.company_confidence}</span>
        {prospect.video_icp_review_id && (
          <Link href={`/gtm/video-icp/${prospect.video_icp_review_id}`}>
            Source review
          </Link>
        )}
      </div>
    </div>
  );
}

function filterProspects(
  prospects: ProspectRow[],
  params: ReturnType<typeof normalizeParams>,
): ProspectRow[] {
  const minScore = params.min ? Number(params.min) : null;
  const video = params.video?.trim().toLowerCase();
  return prospects.filter((prospect) => {
    if (params.status && prospect.status !== params.status) return false;
    if (params.source && prospect.source !== params.source) return false;
    if (params.company && prospect.company_confidence !== params.company) return false;
    if (minScore != null && !Number.isNaN(minScore)) {
      if ((prospect.score ?? 0) < minScore) return false;
    }
    if (video) {
      const title =
        typeof prospect.evidence.video_title === "string"
          ? prospect.evidence.video_title.toLowerCase()
          : "";
      if (!title.includes(video)) return false;
    }
    return true;
  });
}

function normalizeParams(params: Record<string, string | string[] | undefined>) {
  return {
    status: scalar(params.status),
    source: scalar(params.source),
    company: scalar(params.company),
    min: scalar(params.min),
    video: scalar(params.video),
  };
}

function scalar(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
