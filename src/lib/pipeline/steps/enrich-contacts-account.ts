import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow } from "@/lib/supabase/types";
import { advanceStage } from "@/lib/pipeline/opportunities";
import {
  deleteWebsetQuietly,
  enrichViaWebset,
} from "@/lib/pipeline/steps/enrich";
import { exaSearch } from "@/lib/ai/exa";
import { assertEnv } from "@/lib/utils";

type ContactSlot = "primary" | "alternate";

interface ContactState {
  slot: ContactSlot;
  name: string | null;
  email: string | null;
  xUrl: string | null;
  websetId: string | null;
  websetItemId: string | null;
  attempts: number;
}

export async function enrichContactsForAccount(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
): Promise<{
  enriched: boolean;
  needsContact: boolean;
  retrying: boolean;
}> {
  const { data: oppRaw, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const opp = oppRaw as OpportunityRow | null;
  if (!opp || opp.stage !== "researched") {
    return { enriched: false, needsContact: false, retrying: false };
  }

  const contacts = getContacts(opp);
  const hasAnyContact = contacts.some((c) => c.websetId && c.websetItemId);
  if (!hasAnyContact) {
    const advanced = await advanceStage(
      svc,
      opp.id,
      userId,
      "researched",
      "needs_contact",
      { last_error: "No enrichable contacts found" },
    );
    return { enriched: false, needsContact: advanced, retrying: false };
  }

  const apiKey = assertEnv("EXA_API_KEY");
  const updates: Partial<OpportunityRow> = {};
  const nextContacts: ContactState[] = [];

  for (const contact of contacts) {
    const next = { ...contact };
    if (contact.email || !contact.websetId || !contact.websetItemId) {
      nextContacts.push(next);
      continue;
    }
    if (contact.attempts >= opp.max_enrichment_attempts) {
      nextContacts.push(next);
      continue;
    }

    next.attempts++;
    await persistAttempts(svc, userId, opp.id, contact.slot, next.attempts);
    setAttempts(updates, contact.slot, next.attempts);
    const email = await enrichViaWebset(
      apiKey,
      contact.websetId,
      contact.websetItemId,
    );
    if (email) {
      next.email = email;
      setEmail(updates, contact.slot, email);
    }
    if (process.env.ENABLE_X_ENRICHMENT === "true" && !contact.xUrl) {
      const xUrl = await findXUrlQuietly(opp.company_name, contact.name);
      if (xUrl) {
        next.xUrl = xUrl;
        setXUrl(updates, contact.slot, xUrl);
      }
    }
    nextContacts.push(next);
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

  const anyEmail = nextContacts.some((c) => !!c.email);
  const terminalContacts = nextContacts.filter((c) => c.websetId && c.websetItemId);
  const allTerminal =
    terminalContacts.length > 0 &&
    terminalContacts.every(
      (c) => !!c.email || c.attempts >= opp.max_enrichment_attempts,
    );

  if (anyEmail) {
    const advanced = await advanceStage(
      svc,
      opp.id,
      userId,
      "researched",
      "enriched",
      { last_error: null },
    );
    await cleanupWebsets(apiKey, nextContacts);
    return { enriched: advanced, needsContact: false, retrying: false };
  }

  if (allTerminal) {
    const advanced = await advanceStage(
      svc,
      opp.id,
      userId,
      "researched",
      "needs_contact",
      { last_error: "No email found for primary or alternate contact" },
    );
    await cleanupWebsets(apiKey, nextContacts);
    return { enriched: false, needsContact: advanced, retrying: false };
  }

  return { enriched: false, needsContact: false, retrying: true };
}

function getContacts(opp: OpportunityRow): ContactState[] {
  return [
    {
      slot: "primary",
      name: opp.recipient_name,
      email: opp.recipient_email,
      xUrl: opp.recipient_x_url,
      websetId: opp.recipient_webset_id,
      websetItemId: opp.recipient_webset_item_id,
      attempts: opp.enrichment_attempts,
    },
    {
      slot: "alternate",
      name: opp.alt_recipient_name,
      email: opp.alt_recipient_email,
      xUrl: opp.alt_recipient_x_url,
      websetId: opp.alt_recipient_webset_id,
      websetItemId: opp.alt_recipient_webset_item_id,
      attempts: opp.alt_enrichment_attempts,
    },
  ];
}

function setEmail(
  updates: Partial<OpportunityRow>,
  slot: ContactSlot,
  email: string,
) {
  if (slot === "primary") updates.recipient_email = email;
  else updates.alt_recipient_email = email;
}

function setAttempts(
  updates: Partial<OpportunityRow>,
  slot: ContactSlot,
  attempts: number,
) {
  if (slot === "primary") updates.enrichment_attempts = attempts;
  else updates.alt_enrichment_attempts = attempts;
}

async function persistAttempts(
  svc: SupabaseClient,
  userId: string,
  opportunityId: string,
  slot: ContactSlot,
  attempts: number,
) {
  const updates: Partial<OpportunityRow> =
    slot === "primary"
      ? { enrichment_attempts: attempts }
      : { alt_enrichment_attempts: attempts };

  const { error } = await svc
    .from("opportunities")
    .update(updates)
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .eq("stage", "researched");
  if (error) throw error;
}

function setXUrl(
  updates: Partial<OpportunityRow>,
  slot: ContactSlot,
  xUrl: string,
) {
  if (slot === "primary") updates.recipient_x_url = xUrl;
  else updates.alt_recipient_x_url = xUrl;
}

async function findXUrl(
  companyName: string,
  name: string | null,
): Promise<string | null> {
  if (!name) return null;
  const results = await exaSearch({
    query: `X Twitter profile ${name} ${companyName}`,
    numResults: 3,
    includeText: false,
  });
  return (
    results.find((result) =>
      /^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(result.url),
    )?.url ?? null
  );
}

async function findXUrlQuietly(
  companyName: string,
  name: string | null,
): Promise<string | null> {
  try {
    return await findXUrl(companyName, name);
  } catch {
    return null;
  }
}

async function cleanupWebsets(apiKey: string, contacts: ContactState[]) {
  const ids = new Set(
    contacts
      .map((contact) => contact.websetId)
      .filter((id): id is string => !!id),
  );
  await Promise.all([...ids].map((id) => deleteWebsetQuietly(apiKey, id)));
}
