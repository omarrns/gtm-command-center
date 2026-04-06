import Link from "next/link";
import { Plus } from "lucide-react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";

export const metadata = { title: "Outreach · GTM Command Center" };

export default async function OutreachPage() {
  const [user, supabase] = await Promise.all([
    requireUser(),
    createSupabaseServerClient(),
  ]);
  const { data: drafts } = await supabase
    .from("email_drafts")
    .select(
      "id, draft_type, company_name, recipient_name, recipient_title, subject, status, variant_index, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-semibold">Outreach</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Cold email drafts. B2B customer support CEO voice or growth leader
            framing.
          </p>
        </div>
        <Link
          href="/outreach/new"
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <Plus size={13} /> New Draft
        </Link>
      </div>

      {!drafts?.length ? (
        <div className="surface-muted flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            No outreach drafts yet.
          </p>
          <Link href="/outreach/new" className="btn-primary text-xs">
            New Draft
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <Link
              key={d.id}
              href={`/outreach/${d.id}`}
              className="surface flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface-muted)] transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  {d.recipient_name} @ {d.company_name}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                  {d.subject ?? "(no subject)"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="badge">
                  {d.draft_type.replace("email-", "")}
                </span>
                <span
                  className={`badge ${d.status === "saved" ? "badge-success" : ""}`}
                >
                  {d.status}
                </span>
                <span className="text-[11px] text-[var(--color-text-subtle)]">
                  {formatRelativeTime(d.created_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
