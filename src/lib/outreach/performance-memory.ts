import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EmailDraftRow,
  OpportunityRow,
  OutreachEventRow,
} from "@/lib/supabase/types";

const DOCUMENT_KEY = "feedback_outreach_performance";
const DOCUMENT_TITLE = "Outreach Performance Feedback";
const GENERATED_FROM = "outreach_events";
const NOT_ENOUGH_SIGNAL = "- Not enough signal yet.";
const DEFAULT_SINCE_DAYS = 90;
const DEFAULT_LIMIT = 200;
const MAX_SECTION_ITEMS = 5;

type EventWithContext = {
  event: OutreachEventRow;
  opportunity: OpportunityRow | null;
  draft: EmailDraftRow | null;
};

export interface WriteOutreachPerformanceMemoryInput {
  svc: SupabaseClient;
  userId: string;
  sinceDays?: number;
  limit?: number;
  runId?: string;
}

export interface WriteOutreachPerformanceMemoryResult {
  eventCount: number;
  oldestEventAt: string | null;
  newestEventAt: string | null;
  content: string;
  upserted: boolean;
}

export async function writeOutreachPerformanceMemory({
  svc,
  userId,
  sinceDays = DEFAULT_SINCE_DAYS,
  limit = DEFAULT_LIMIT,
  runId,
}: WriteOutreachPerformanceMemoryInput): Promise<WriteOutreachPerformanceMemoryResult> {
  const events = await fetchRecentEvents(svc, userId, sinceDays, limit);
  const context = await loadEventContext(svc, userId, events);
  const content = buildOutreachPerformanceMarkdown(context);
  const eventTimes = events.map((event) => event.occurred_at).sort();
  const oldestEventAt = eventTimes[0] ?? null;
  const newestEventAt = eventTimes[eventTimes.length - 1] ?? null;

  const { error } = await svc.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: DOCUMENT_KEY,
      title: DOCUMENT_TITLE,
      origin: "system",
      content,
      metadata: {
        generated_from: GENERATED_FROM,
        event_count: events.length,
        since_days: sinceDays,
        oldest_event_at: oldestEventAt,
        newest_event_at: newestEventAt,
        ...(runId ? { run_id: runId } : {}),
      },
    },
    { onConflict: "user_id,document_key" },
  );
  if (error) {
    throw new Error(`feedback outreach performance upsert failed: ${error.message}`);
  }

  return {
    eventCount: events.length,
    oldestEventAt,
    newestEventAt,
    content,
    upserted: true,
  };
}

export function buildOutreachPerformanceMarkdown(
  context: EventWithContext[],
): string {
  const positive = context.filter(isPositiveEvent);
  const negative = context.filter(isNegativeEvent);
  const manualNotes = context.filter(hasManualNote);

  return [
    "## Positive Patterns",
    ...positivePatternLines(positive),
    "",
    "## Negative Patterns",
    ...negativePatternLines(negative),
    "",
    "## Strongest Trigger Signals",
    ...strongestTriggerSignalLines(positive),
    "",
    "## Strongest Account Signals",
    ...strongestAccountSignalLines(positive),
    "",
    "## Manual Outcome Notes",
    ...manualOutcomeNoteLines(manualNotes),
    "",
    "## Evidence Summary",
    ...evidenceSummaryLines(context),
  ].join("\n");
}

async function fetchRecentEvents(
  svc: SupabaseClient,
  userId: string,
  sinceDays: number,
  limit: number,
): Promise<OutreachEventRow[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await svc
    .from("outreach_events")
    .select("*")
    .eq("user_id", userId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`outreach_events lookup failed: ${error.message}`);
  return ((data ?? []) as unknown[]).map((row) => row as OutreachEventRow);
}

async function loadEventContext(
  svc: SupabaseClient,
  userId: string,
  events: OutreachEventRow[],
): Promise<EventWithContext[]> {
  const opportunityIds = unique(events.map((event) => event.opportunity_id));
  const opportunities = await fetchRowsByIds<OpportunityRow>(
    svc,
    "opportunities",
    userId,
    opportunityIds,
  );
  const opportunitiesById = new Map(opportunities.map((row) => [row.id, row]));

  const draftIds = unique(
    events
      .map((event) => event.email_draft_id ?? opportunitiesById.get(event.opportunity_id)?.selected_draft_id)
      .filter(isPresent),
  );
  const drafts = await fetchRowsByIds<EmailDraftRow>(
    svc,
    "email_drafts",
    userId,
    draftIds,
  );

  const draftsById = new Map(drafts.map((row) => [row.id, row]));

  return events.map((event) => {
    const opportunity = opportunitiesById.get(event.opportunity_id) ?? null;
    const draftId = event.email_draft_id ?? opportunity?.selected_draft_id;
    return {
      event,
      opportunity,
      draft: draftId ? draftsById.get(draftId) ?? null : null,
    };
  });
}

async function fetchRowsByIds<Row extends { id: string }>(
  svc: SupabaseClient,
  table: string,
  userId: string,
  ids: string[],
): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { data, error } = await svc
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw new Error(`${table} lookup failed: ${error.message}`);
  return ((data ?? []) as unknown[]).map((row) => row as Row);
}

function positivePatternLines(items: EventWithContext[]): string[] {
  if (items.length === 0) return [NOT_ENOUGH_SIGNAL];
  return topLines(patternCounts(items, "positive"));
}

function negativePatternLines(items: EventWithContext[]): string[] {
  if (items.length === 0) return [NOT_ENOUGH_SIGNAL];
  return topLines(patternCounts(items, "negative"));
}

function strongestTriggerSignalLines(items: EventWithContext[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const signal of item.opportunity?.trigger_signals ?? []) {
      increment(counts, triggerSignalLabel(signal));
    }
  }
  return topLines(counts);
}

function strongestAccountSignalLines(items: EventWithContext[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const opp = item.opportunity;
    if (!opp) continue;
    if (opp.source) increment(counts, `Source: ${opp.source}`);
    if (opp.recipient_title) increment(counts, `Buyer title: ${opp.recipient_title}`);
    if (opp.role_title) increment(counts, `Role/title: ${opp.role_title}`);
    if (opp.score != null) increment(counts, `Score band: ${scoreBand(opp.score)}`);
  }
  return topLines(counts);
}

function manualOutcomeNoteLines(items: EventWithContext[]): string[] {
  const lines = items
    .map((item) => {
      const note = metadataString(item.event.metadata, "note");
      if (!note) return null;
      const outcome = metadataString(item.event.metadata, "outcome") ?? "manual_outcome";
      const company = item.opportunity?.company_name ?? "Unknown account";
      return `- ${company} (${humanize(outcome)}): ${singleLine(note)}`;
    })
    .filter(isPresent);
  return lines.length > 0 ? lines.slice(0, MAX_SECTION_ITEMS) : [NOT_ENOUGH_SIGNAL];
}

function evidenceSummaryLines(context: EventWithContext[]): string[] {
  const times = context.map((item) => item.event.occurred_at).sort();
  const oldest = times[0] ?? "none";
  const newest = times[times.length - 1] ?? "none";
  const eventCounts = topLines(countBy(context, (item) => humanize(item.event.event_type)));
  return [
    `- Events reviewed: ${context.length}`,
    `- Date range: ${oldest} to ${newest}`,
    ...eventCounts,
  ];
}

function isPositiveEvent(item: EventWithContext): boolean {
  if (item.event.event_type === "reply_detected") return true;
  const outcome = metadataString(item.event.metadata, "outcome");
  return outcome === "positive_reply" || outcome === "booked" || outcome === "manual_conversion";
}

function isNegativeEvent(item: EventWithContext): boolean {
  if (item.event.event_type === "no_response_7d") return true;
  const outcome = metadataString(item.event.metadata, "outcome");
  return outcome === "bad_fit" || outcome === "not_icp";
}

function hasManualNote(item: EventWithContext): boolean {
  return item.event.event_type === "manual_outcome" && Boolean(metadataString(item.event.metadata, "note"));
}

function patternCounts(
  items: EventWithContext[],
  polarity: "positive" | "negative",
): Map<string, number> {
  const counts = new Map<string, number>();
  const prefix = polarity === "positive" ? "Positive outcomes" : "Negative outcomes";

  for (const item of items) {
    const opp = item.opportunity;
    if (item.draft?.subject) {
      increment(counts, `${prefix} with subject: "${singleLine(item.draft.subject)}"`);
    }
    if (opp?.recipient_title) {
      increment(counts, `${prefix} with buyer title: ${opp.recipient_title}`);
    }
    if (opp?.source) {
      increment(counts, `${prefix} from source: ${opp.source}`);
    }
    if (opp?.score != null) {
      increment(counts, `${prefix} in score band: ${scoreBand(opp.score)}`);
    }
    for (const signal of opp?.trigger_signals ?? []) {
      increment(counts, `${prefix} with trigger: ${triggerSignalLabel(signal)}`);
    }
  }

  return counts;
}

function triggerSignalLabel(signal: Record<string, unknown>): string {
  for (const key of ["type", "event", "title", "role", "hiring_role", "signal"]) {
    const value = metadataString(signal, key);
    if (value) return `${humanize(key)}: ${singleLine(value)}`;
  }
  return `Signal: ${singleLine(JSON.stringify(signal))}`;
}

function topLines(counts: Map<string, number>): string[] {
  const lines = [...counts.entries()]
    .sort(([leftLabel, leftCount], [rightLabel, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount;
      return leftLabel.localeCompare(rightLabel);
    })
    .slice(0, MAX_SECTION_ITEMS)
    .map(([label, count]) => `- ${label} (${count})`);
  return lines.length > 0 ? lines : [NOT_ENOUGH_SIGNAL];
}

function countBy(
  items: EventWithContext[],
  labelForItem: (item: EventWithContext) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) increment(counts, labelForItem(item));
  return counts;
}

function increment(counts: Map<string, number>, label: string): void {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function scoreBand(score: number): string {
  if (score >= 80) return "80+";
  if (score >= 60) return "60-79";
  if (score >= 40) return "40-59";
  return "0-39";
}
