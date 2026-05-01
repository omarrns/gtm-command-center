import { redirect } from "next/navigation";
import { createLogger } from "@/lib/logger";
import { safeParseIcpRubric, type IcpRubric } from "@/lib/onboarding/icp-schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/supabase/server";
import { MessagingHub } from "./_components/messaging-hub";

const MEMORY_DOC_KEYS = [
  "company_icp",
  "icp_proof_points",
  "icp_disqualifiers",
  "icp_narrative_arc",
] as const;

type MemoryDocKey = (typeof MEMORY_DOC_KEYS)[number];

export default async function MessagingPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const log = createLogger({ scope: "messaging.page", userId: user.id });

  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.user_type !== "gtm") {
    redirect("/");
  }

  const [memoryRes, scoringRes, interviewRes] = await Promise.all([
    svc
      .from("memory_documents")
      .select("document_key, content")
      .eq("user_id", user.id)
      .in("document_key", [...MEMORY_DOC_KEYS]),
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", user.id)
      .maybeSingle(),
    svc
      .from("onboarding_interviews")
      .select("status")
      .eq("user_id", user.id)
      .eq("template_id", "icp_definition")
      .in("status", ["review", "story_review"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let hasError = false;
  if (memoryRes.error) {
    hasError = true;
    log.error("memory_documents lookup failed", memoryRes.error);
  }
  if (scoringRes.error) {
    hasError = true;
    log.error("user_scoring_profiles lookup failed", scoringRes.error);
  }
  if (interviewRes.error) {
    hasError = true;
    log.error("onboarding_interviews lookup failed", interviewRes.error);
  }

  const memoryDocs: Partial<Record<MemoryDocKey, string>> = {};
  for (const row of memoryRes.data ?? []) {
    if (isMemoryDocKey(row.document_key)) {
      memoryDocs[row.document_key] = row.content ?? "";
    }
  }

  const rubric = parseRubricOrNull(scoringRes.data?.icp_rubric ?? null, log);

  return (
    <MessagingHub
      memoryDocs={memoryDocs}
      rubric={rubric}
      hasActiveIcpReview={Boolean(interviewRes.data)}
      hasError={hasError}
    />
  );
}

function isMemoryDocKey(value: string): value is MemoryDocKey {
  return (MEMORY_DOC_KEYS as readonly string[]).includes(value);
}

function parseRubricOrNull(
  rawRubric: unknown,
  log: ReturnType<typeof createLogger>,
): IcpRubric | null {
  if (rawRubric == null) return null;

  const parsed = safeParseIcpRubric(rawRubric);
  if (!parsed.success) {
    log.error("icp_rubric failed schema validation", parsed.error);
    return null;
  }

  return parsed.data;
}
