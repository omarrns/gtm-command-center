import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/supabase/server";
import { listVideoIcpReviews } from "@/lib/video-icp/reviews";
import { VideoIcpForm } from "./_components/video-icp-form";

export default async function VideoIcpPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.user_type !== "gtm") redirect("/");

  const reviews = await listVideoIcpReviews(svc, user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video ICP"
        description="Preview how synthetic ICP buyers may react to a YouTube video. Comments remain raw and unscored."
      />

      <section className="space-y-3 border-b border-[var(--color-border)] pb-6">
        <h2 className="text-sm font-medium text-[var(--color-text)]">
          New review
        </h2>
        <VideoIcpForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--color-text)]">
          Recent reviews
        </h2>
        {reviews.length === 0 ? (
          <EmptyState
            message="No video reviews yet"
            hint="Paste a YouTube URL to run the first synthetic ICP review."
          />
        ) : (
          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {reviews.map((review) => (
              <Link
                key={review.id}
                href={`/gtm/video-icp/${review.id}`}
                className="block px-4 py-3 transition-colors hover:bg-[var(--color-surface-muted)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {review.video_title ?? review.youtube_url}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {review.channel_title ?? "Queued video"} -{" "}
                      {new Date(review.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 rounded px-2 py-1 text-xs capitalize text-[var(--color-text-muted)] bg-[var(--color-surface-muted)]">
                    {review.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
