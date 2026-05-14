import { redirect } from "next/navigation";
import { isOnboardingComplete } from "@/lib/pipeline/onboarding";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/supabase/server";
import type {
  MemoryDocumentRow,
  PipelineConfigRow,
  UserScoringProfileRow,
  UserType,
} from "@/lib/supabase/types";
import { ProfileContent } from "./_components/profile-content";
import type { MarkdownSection } from "./_components/profile-markdown";

const MEMORY_KEYS = [
  "user_profile",
  "user_positioning",
  "user_dealbreakers",
  "feedback_outreach_style",
  "interview_insights",
] as const;

type MemoryKey = (typeof MEMORY_KEYS)[number];

export default async function ProfilePage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: profileRow, error: profileError } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to load profile: ${profileError.message}`);
  }

  const userType = (profileRow?.user_type as UserType | null) ?? null;
  if (userType === "gtm") {
    redirect("/gtm/icp");
  }

  const onboarding = await isOnboardingComplete(svc, user.id, "job_seeker");
  if (!onboarding.complete) {
    redirect("/onboard");
  }

  const [memoryRes, configRes, scoringRes] = await Promise.all([
    svc
      .from("memory_documents")
      .select("*")
      .eq("user_id", user.id)
      .in("document_key", [...MEMORY_KEYS]),
    svc
      .from("pipeline_config")
      .select(
        "id,user_id,score_threshold,search_queries,search_locations,daily_send_cap,gmail_send_address,activation_completed_at,created_at,updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    svc
      .from("user_scoring_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (memoryRes.error) {
    throw new Error(`Failed to load memory documents: ${memoryRes.error.message}`);
  }
  if (configRes.error) {
    throw new Error(`Failed to load pipeline config: ${configRes.error.message}`);
  }
  if (scoringRes.error) {
    throw new Error(`Failed to load scoring profile: ${scoringRes.error.message}`);
  }

  const memoryDocs = Object.fromEntries(
    ((memoryRes.data ?? []) as MemoryDocumentRow[]).map((doc) => [
      doc.document_key,
      doc,
    ]),
  ) as Partial<Record<MemoryKey, MemoryDocumentRow>>;

  return (
    <ProfileContent
      profileSections={parseMarkdownSections(memoryDocs.user_profile?.content)}
      positioningSections={parseMarkdownSections(
        memoryDocs.user_positioning?.content,
      )}
      dealbreakerSections={parseMarkdownSections(
        memoryDocs.user_dealbreakers?.content,
      )}
      outreachSections={parseMarkdownSections(
        memoryDocs.feedback_outreach_style?.content,
      )}
      insightSections={parseMarkdownSections(
        memoryDocs.interview_insights?.content,
      )}
      config={(configRes.data as PipelineConfigRow | null) ?? null}
      scoring={(scoringRes.data as UserScoringProfileRow | null) ?? null}
      hasAnyMemory={Object.keys(memoryDocs).length > 0}
    />
  );
}

function parseMarkdownSections(
  content: string | null | undefined,
): MarkdownSection[] {
  if (!content?.trim()) return [];

  const normalized = content
    .replace(/\n\s*---\s*\n/g, "\n\n")
    .replace(/\r\n/g, "\n")
    .trim();
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  for (const line of normalized.split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current?.body.trim()) {
        sections.push({ ...current, body: current.body.trim() });
      }
      current = { title: heading[1].trim(), body: "" };
      continue;
    }

    if (!current) {
      current = { title: "Notes", body: "" };
    }
    current.body += `${line}\n`;
  }

  if (current?.body.trim()) {
    sections.push({ ...current, body: current.body.trim() });
  }

  return sections;
}
