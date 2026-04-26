import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow, WebsetMatchReason } from "@/lib/supabase/types";
import { icpRubricSchema } from "@/lib/onboarding/icp-schemas";
import type { IcpRubric } from "@/lib/pipeline/icp-to-theirstack-filters";
import {
  runWebsetPersonSearch,
  type WebsetItem,
} from "@/lib/pipeline/people-search";

interface SelectedContact {
  name: string | null;
  title: string | null;
  linkedinUrl: string | null;
  pictureUrl: string | null;
  location: string | null;
  matchReasons: WebsetMatchReason[] | null;
  websetId: string | null;
  websetItemId: string | null;
}

export async function discoverContactsForAccount(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
): Promise<{ primary: boolean; alternate: boolean }> {
  const { data: oppRaw, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const opp = oppRaw as OpportunityRow | null;
  if (!opp || opp.stage !== "researched") {
    return { primary: false, alternate: false };
  }

  const needsPrimary = !opp.recipient_webset_item_id;
  const needsAlternate = !opp.alt_recipient_webset_item_id;
  if (!needsPrimary && !needsAlternate) {
    return { primary: false, alternate: false };
  }

  const rubric = await loadIcpRubric(svc, userId);
  const updates: Partial<OpportunityRow> = {};

  const [primary, alternate] = await Promise.all([
    needsPrimary ? findPrimaryContact(opp, rubric) : Promise.resolve(null),
    needsAlternate ? findAlternateContact(opp) : Promise.resolve(null),
  ]);

  if (primary) {
    updates.recipient_name = primary.name;
    updates.recipient_title = primary.title;
    updates.recipient_linkedin_url = primary.linkedinUrl;
    updates.recipient_picture_url = primary.pictureUrl;
    updates.recipient_location = primary.location;
    updates.recipient_match_reasons = primary.matchReasons;
    updates.recipient_webset_id = primary.websetId;
    updates.recipient_webset_item_id = primary.websetItemId;
  }

  if (alternate) {
    updates.alt_recipient_name = alternate.name;
    updates.alt_recipient_title = alternate.title;
    updates.alt_recipient_linkedin_url = alternate.linkedinUrl;
    updates.alt_recipient_picture_url = alternate.pictureUrl;
    updates.alt_recipient_location = alternate.location;
    updates.alt_recipient_match_reasons = alternate.matchReasons;
    updates.alt_recipient_webset_id = alternate.websetId;
    updates.alt_recipient_webset_item_id = alternate.websetItemId;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await svc
      .from("opportunities")
      .update(updates)
      .eq("id", opp.id)
      .eq("user_id", userId)
      .eq("stage", "researched");
    if (updateError) throw updateError;
  }

  return { primary: !!primary, alternate: !!alternate };
}

async function loadIcpRubric(
  svc: SupabaseClient,
  userId: string,
): Promise<IcpRubric> {
  const { data, error } = await svc
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const parsed = icpRubricSchema.safeParse(data?.icp_rubric ?? {});
  return parsed.success ? parsed.data : {};
}

async function findPrimaryContact(
  opp: OpportunityRow,
  rubric: IcpRubric,
): Promise<SelectedContact | null> {
  const titles = buyerTitles(rubric);
  const query = `${titles.join(" OR ")} at ${opp.company_name} ${opp.company_domain ?? ""}`;
  const result = await runWebsetPersonSearch({
    query,
    count: 5,
    criteria: [
      { description: `Person currently works at ${opp.company_name}` },
      {
        description: `Person is a likely economic buyer, champion, or end user for ${opp.company_name}`,
      },
    ],
    metadata: {
      pipeline: "gtm-find-contacts",
      company: opp.company_name,
      role: "primary",
    },
  });
  return selectFirst(result.websetId, result.items);
}

async function findAlternateContact(
  opp: OpportunityRow,
): Promise<SelectedContact | null> {
  const titles = managerTitles(opp.role_title);
  const query = `${titles.join(" OR ")} at ${opp.company_name} ${opp.company_domain ?? ""}`;
  const result = await runWebsetPersonSearch({
    query,
    count: 5,
    criteria: [
      { description: `Person currently works at ${opp.company_name}` },
      {
        description: `Person manages or leads a team related to ${opp.role_title ?? "the hiring signal"}`,
      },
    ],
    metadata: {
      pipeline: "gtm-find-contacts",
      company: opp.company_name,
      role: "alternate",
    },
  });
  return selectFirst(result.websetId, result.items);
}

function buyerTitles(rubric: IcpRubric): string[] {
  const buyer = rubric.buyer;
  const raw = [buyer?.economic_buyer, buyer?.champion, buyer?.end_user].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return raw.length > 0 ? raw : ["VP Sales", "Head of Revenue", "GTM leader"];
}

export function managerTitles(roleTitle: string | null): string[] {
  const role = (roleTitle ?? "").toLowerCase();
  if (role.includes("sales") || role.includes("account executive")) {
    return ["Sales Manager", "VP Sales", "Head of Sales"];
  }
  if (role.includes("marketing") || role.includes("growth")) {
    return ["Marketing Manager", "VP Marketing", "Head of Growth"];
  }
  if (
    role.includes("engineer") ||
    role.includes("developer") ||
    role.includes("ai") ||
    role.includes("data")
  ) {
    return ["Engineering Manager", "VP Engineering", "Head of Engineering"];
  }
  if (role.includes("product")) {
    return ["Product Manager", "VP Product", "Head of Product"];
  }
  return ["Hiring Manager", "Department Head", "VP"];
}

function selectFirst(
  websetId: string,
  items: WebsetItem[],
): SelectedContact | null {
  const item = items[0];
  if (!item) return null;
  const person = item.properties.person;
  return {
    name: person.name ?? null,
    title: person.position ?? null,
    linkedinUrl: item.properties.url ?? null,
    pictureUrl: person.pictureUrl ?? null,
    location: person.location ?? null,
    matchReasons: item.evaluations?.length ? item.evaluations : null,
    websetId,
    websetItemId: item.id,
  };
}
