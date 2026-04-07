import Link from "next/link";
import { Plus } from "lucide-react";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { EmptyState } from "@/components/empty-state";

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
      <PageHeader
        title="Outreach"
        description="Cold email drafts. B2B customer support CEO voice or growth leader framing."
      >
        <Link
          href="/outreach/new"
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <Plus size={14} /> New Draft
        </Link>
      </PageHeader>

      {!drafts?.length ? (
        <EmptyState message="Draft your first cold email to get started.">
          <Link href="/outreach/new" className="btn-primary text-xs">
            New Draft
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <ListItem
              key={d.id}
              href={`/outreach/${d.id}`}
              title={`${d.recipient_name} @ ${d.company_name}`}
              subtitle={d.subject ?? "(no subject)"}
              meta={
                <>
                  <span className="badge">
                    {d.draft_type.replace("email-", "")}
                  </span>
                  <span
                    className={`badge ${d.status === "saved" ? "badge-success" : ""}`}
                  >
                    {d.status}
                  </span>
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    {formatRelativeTime(d.created_at)}
                  </span>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
