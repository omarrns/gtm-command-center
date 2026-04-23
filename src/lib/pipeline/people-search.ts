/**
 * Pure people-search function — extracted from people-research job handler.
 * Uses Exa Websets (person entity) to find CEO + hiring manager with stable item IDs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { runClaudeJson } from "@/lib/ai/anthropic";
import type { AiCallScope } from "@/lib/ai/calls";
import {
  buildPeopleResearchSystem,
  buildPeopleResearchPrompt,
} from "@/lib/skills/prompts/people-research";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import { assertEnv } from "@/lib/utils";

const WEBSETS_BASE = "https://api.exa.ai/websets/v0";

// ---------------------------------------------------------------------------
// Exa Websets response types
// ---------------------------------------------------------------------------

interface WebsetPersonProperties {
  type: "person";
  url: string;
  description: string;
  person: {
    name: string;
    location?: string;
    position?: string;
    company?: string;
    pictureUrl?: string;
  };
}

interface WebsetItem {
  id: string;
  object: "webset_item";
  source: string;
  sourceId: string;
  websetId: string;
  properties: WebsetPersonProperties;
  evaluations: Array<{
    criterion: string;
    reasoning: string;
    satisfied: "yes" | "no" | "unclear";
  }>;
  enrichments: Array<{
    object: "enrichment_result";
    enrichmentId: string;
    format: string;
    result: string[] | null;
    reasoning: string;
  }> | null;
  createdAt: string;
  updatedAt: string;
}

interface WebsetSearch {
  id: string;
  status: string;
  progress: { found: number; completion: number };
}

interface Webset {
  id: string;
  status: "running" | "idle" | "paused";
  searches: WebsetSearch[];
}

interface WebsetItemsResponse {
  data: WebsetItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

interface PeopleResearchContact {
  identified: boolean;
  name: string | null;
  title: string | null;
  webset_item_id: string | null;
  [key: string]: unknown;
}

interface PeopleResearchOutput {
  recommended_first_contact?: "ceo" | "hiring_manager" | "neither";
  ceo?: PeopleResearchContact;
  hiring_manager?: PeopleResearchContact;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PeopleSearchResult {
  recipientName: string | null;
  recipientTitle: string | null;
  recipientWebsetId: string | null;
  recipientWebsetItemId: string | null;
  researchResult: Record<string, unknown>;
}

export type ContactArchetype =
  | "founder"
  | "hiring_manager"
  | "department_head"
  | "recruiter";

export interface PeopleSearchOptions {
  /** Preferred contact archetype from the pursuit planner. Adjusts search query and selection. */
  targetContact?: ContactArchetype;
  /** Optional capture scope for the embedded Claude call. */
  scope?: AiCallScope;
}

export async function researchPeople(
  companyName: string,
  roleTitle: string,
  userId: string,
  client?: SupabaseClient,
  options?: PeopleSearchOptions,
): Promise<PeopleSearchResult> {
  const apiKey = assertEnv("EXA_API_KEY");
  const target = options?.targetContact;

  // Build search query based on targeting
  const query = buildSearchQuery(companyName, roleTitle, target);
  const criteria = buildSearchCriteria(companyName, roleTitle, target);

  const webset = await createWebset(apiKey, {
    search: {
      query,
      count: 5,
      entity: { type: "person" },
      criteria,
    },
    metadata: {
      pipeline: "v2",
      company: companyName,
      targetContact: target ?? "default",
    },
  });

  const idleWebset = await waitUntilIdle(apiKey, webset.id);
  const items = await listItems(apiKey, idleWebset.id);

  const researchText = formatItemsForPrompt(items, companyName);

  const memoryCtx = await loadMemoryContext(userId, client);
  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);

  const result = await runClaudeJson<PeopleResearchOutput>({
    system: buildPeopleResearchSystem(sender),
    prompt: buildPeopleResearchPrompt({
      companyName,
      roleTitle,
      research: researchText,
    }),
    maxTokens: 4096,
    scope: options?.scope,
  });

  // Select contact based on planner targeting (if specified)
  const recommended = result.recommended_first_contact;
  const contact = selectContact(result, target, recommended);

  // Primary: use the webset_item_id the model extracted from the [ID: witem_xxx] tag.
  // Fallback: case-insensitive name match against webset items.
  const idToItem = new Map<string, WebsetItem>();
  const nameToItem = new Map<string, WebsetItem>();
  for (const item of items) {
    idToItem.set(item.id, item);
    const name = item.properties.person.name?.toLowerCase();
    if (name) nameToItem.set(name, item);
  }

  let matchedItem: WebsetItem | null = null;
  if (contact?.identified) {
    if (contact.webset_item_id) {
      matchedItem = idToItem.get(contact.webset_item_id) ?? null;
    }
    if (!matchedItem && contact.name) {
      matchedItem = nameToItem.get(contact.name.toLowerCase()) ?? null;
    }
  }

  // Do NOT delete the webset — enrichment step needs it to discover email addresses.
  // Websets are cleaned up after enrichment completes or when retries are exhausted.

  return {
    recipientName: contact?.name ?? null,
    recipientTitle: contact?.title ?? null,
    recipientWebsetId: webset.id,
    recipientWebsetItemId: matchedItem?.id ?? null,
    researchResult: result as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Planner-aware targeting helpers
// ---------------------------------------------------------------------------

function buildSearchQuery(
  companyName: string,
  roleTitle: string,
  target?: ContactArchetype,
): string {
  switch (target) {
    case "founder":
      return `CEO OR founder OR co-founder at ${companyName}`;
    case "hiring_manager":
      return `"${roleTitle}" hiring manager OR team lead at ${companyName}`;
    case "department_head":
      return `VP OR "Head of" OR Director at ${companyName}`;
    case "recruiter":
      return `recruiter OR talent acquisition at ${companyName}`;
    default:
      return `CEO OR founder OR "${roleTitle}" hiring manager at ${companyName}`;
  }
}

function buildSearchCriteria(
  companyName: string,
  roleTitle: string,
  target?: ContactArchetype,
): Array<{ description: string }> {
  const base = { description: `Person currently works at ${companyName}` };
  switch (target) {
    case "founder":
      return [
        base,
        {
          description: `Person is the CEO, founder, or co-founder of ${companyName}`,
        },
      ];
    case "hiring_manager":
      return [
        base,
        {
          description: `Person is a manager or team lead who would hire a ${roleTitle}`,
        },
      ];
    case "department_head":
      return [
        base,
        {
          description: `Person is a VP, Head, or Director in a department related to ${roleTitle}`,
        },
      ];
    case "recruiter":
      return [
        base,
        { description: `Person works in recruiting or talent acquisition` },
      ];
    default:
      return [
        base,
        {
          description: `Person is either the CEO/founder or a senior leader who would hire a ${roleTitle}`,
        },
      ];
  }
}

/** Select the best contact from research output, preferring the planner's target archetype. */
function selectContact(
  result: PeopleResearchOutput,
  target: ContactArchetype | undefined,
  recommended: PeopleResearchOutput["recommended_first_contact"],
): PeopleResearchContact | undefined {
  // If planner says founder → prefer CEO contact
  if (target === "founder" && result.ceo?.identified) {
    return result.ceo;
  }
  // If planner says hiring_manager/department_head/recruiter → prefer hiring_manager contact
  if (
    (target === "hiring_manager" ||
      target === "department_head" ||
      target === "recruiter") &&
    result.hiring_manager?.identified
  ) {
    return result.hiring_manager;
  }
  // Fall back to Claude's recommendation
  return recommended === "ceo" ? result.ceo : result.hiring_manager;
}

// ---------------------------------------------------------------------------
// Exa Websets helpers (minimal, no SDK dependency)
// ---------------------------------------------------------------------------

async function websetsFetch<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${WEBSETS_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Exa Websets ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function createWebset(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<Webset> {
  return websetsFetch<Webset>(apiKey, "/websets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function waitUntilIdle(
  apiKey: string,
  websetId: string,
  timeoutMs = 180_000,
): Promise<Webset> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ws = await websetsFetch<Webset>(apiKey, `/websets/${websetId}`);
    if (ws.status === "idle") return ws;
    if (ws.status === "paused") throw new Error(`Webset ${websetId} paused`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Webset ${websetId} timed out after ${timeoutMs / 1000}s`);
}

async function listItems(
  apiKey: string,
  websetId: string,
): Promise<WebsetItem[]> {
  const res = await websetsFetch<WebsetItemsResponse>(
    apiKey,
    `/websets/${websetId}/items?limit=100`,
  );
  return res.data ?? [];
}

/**
 * Format Webset person items for the Claude prompt.
 * Includes item IDs so the model output can be mapped back reliably.
 */
function formatItemsForPrompt(
  items: WebsetItem[],
  companyName: string,
): string {
  if (!items.length) return `No people found for ${companyName}.`;

  return items
    .map((item, i) => {
      const person = item.properties.person;
      return [
        `${i + 1}. [ID: ${item.id}] **${person.name ?? "Unknown"}** — ${person.position ?? "Unknown title"}`,
        `   URL: ${item.properties.url ?? "N/A"}`,
        `   Description: ${item.properties.description ?? ""}`,
      ].join("\n");
    })
    .join("\n\n");
}
