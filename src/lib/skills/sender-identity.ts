/**
 * SenderIdentity — shared identity contract for parameterized system prompts.
 *
 * Required fields always resolve from onboarding data or the profiles table.
 * Optional fields are heuristic-extracted from Career Highlights text; when
 * missing, system prompt templates use conditional blocks that omit sections
 * entirely rather than inserting empty strings.
 *
 * Handles two profile formats:
 * - Phase 8 sectioned: ## Positioning, ## Career Highlights, ## Technical Tools, ## Top Proof Points
 * - Legacy freeform: prose paragraphs with "Tools:" and "Key builds:" lines
 */

import type { MemoryContext } from "./context";
import { extractSection } from "@/lib/onboarding/markdown";

// ── Public interface ──

export interface SenderIdentity {
  // Required (always populated from onboarding or profiles table)
  firstName: string;
  fullName: string;
  positioning: string;
  tools: string[];
  proofPoints: string[];
  outreachTone: "casual" | "direct" | "formal";

  // Optional (heuristic-extracted from Career Highlights, may be null)
  recentCompany: string | null;
  recentCompanyDescriptor: string | null;
  recentRole: string | null;
  domainInsiderClaim: string | null;
  signOff: string;
}

// ── Extraction ──

export function extractSenderIdentity(
  ctx: MemoryContext,
  displayName?: string | null,
): SenderIdentity {
  const firstName = extractFirstName(displayName);
  const fullName = displayName?.trim() || "the sender";

  const isLegacyFormat = !ctx.profile.includes("## Positioning");

  // Positioning: prefer ctx.positioning (from user_positioning doc) over
  // section extraction, since legacy profiles don't have ## Positioning.
  const positioning =
    ctx.positioning ||
    extractSection(ctx.profile, "Positioning") ||
    (isLegacyFormat ? extractLegacyPositioning(ctx.profile) : "") ||
    ctx.profile;

  const tools = isLegacyFormat
    ? extractLegacyTools(ctx.profile)
    : extractTools(ctx.profile);

  const proofPoints = isLegacyFormat
    ? extractLegacyProofPoints(ctx.profile)
    : extractProofPoints(ctx.profile);

  const outreachTone = extractOutreachTone(ctx.outreachStyle);

  // Career info: try Phase 8 section first, then legacy "Career:" line
  const careerHighlights =
    extractSection(ctx.profile, "Career Highlights") ||
    (isLegacyFormat ? extractLegacyCareer(ctx.profile) : "");
  const { recentCompany, recentCompanyDescriptor, recentRole } =
    extractCareerInfo(careerHighlights);

  const domainInsiderClaim = recentCompany
    ? "selling to the same buyer in the same market"
    : null;

  const signOff = firstName !== "there" ? firstName : "Best";

  return {
    firstName,
    fullName,
    positioning,
    tools,
    proofPoints,
    outreachTone,
    recentCompany,
    recentCompanyDescriptor,
    recentRole,
    domainInsiderClaim,
    signOff,
  };
}

// ── Phase 8 sectioned format helpers ──

function extractFirstName(displayName?: string | null): string {
  const name = displayName?.trim();
  if (!name) return "there";
  return name.split(/\s+/)[0];
}

function extractTools(profile: string): string[] {
  const section = extractSection(profile, "Technical Tools");
  if (!section) return [];
  return section
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function extractProofPoints(profile: string): string[] {
  const section = extractSection(profile, "Top Proof Points");
  if (!section) return [];
  return splitBullets(section);
}

// ── Legacy freeform format helpers ──
// Legacy format: prose paragraphs with lines like "Tools: Apollo, HubSpot, ..."
// and "Key builds: Compass (...), competitive intel engine (...)"

function extractLegacyPositioning(profile: string): string {
  // First paragraph is usually the positioning statement in legacy format
  const firstParagraph = profile.split("\n\n")[0]?.trim();
  return firstParagraph ?? "";
}

function extractLegacyTools(profile: string): string[] {
  const match = profile.match(/^Tools:\s*(.+)/m);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((t) => t.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

function extractLegacyProofPoints(profile: string): string[] {
  const match = profile.match(/^Key builds:\s*(.+)/m);
  if (!match) return [];
  // Legacy format uses comma-separated builds with parenthetical details
  return match[1]
    .split(/,\s*(?=[A-Z])/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

function extractLegacyCareer(profile: string): string {
  const match = profile.match(/^Career:\s*(.+)/m);
  return match?.[1]?.trim() ?? "";
}

// ── Shared helpers ──

const VALID_TONES = new Set(["casual", "direct", "formal"]);

function extractOutreachTone(
  outreachStyle: string,
): "casual" | "direct" | "formal" {
  const section = extractSection(outreachStyle, "Outreach Tone");
  if (!section) return "casual";
  const lower = section.toLowerCase();
  for (const tone of VALID_TONES) {
    if (lower.includes(tone)) return tone as "casual" | "direct" | "formal";
  }
  return "casual";
}

interface CareerInfo {
  recentCompany: string | null;
  recentCompanyDescriptor: string | null;
  recentRole: string | null;
}

function extractCareerInfo(careerHighlights: string): CareerInfo {
  const empty: CareerInfo = {
    recentCompany: null,
    recentCompanyDescriptor: null,
    recentRole: null,
  };

  if (!careerHighlights) return empty;

  // Get the first bullet line (or the whole string if no bullets)
  const lines = careerHighlights.split("\n").filter((l) => l.trim());
  const firstLine = lines[0]?.replace(/^[-*]\s*/, "").trim();
  if (!firstLine) return empty;

  // Try "at {Company}" pattern — e.g., "Built Compass at Acme (enterprise AI startup)"
  const atMatch = firstLine.match(
    /^(.+?)\s+at\s+([A-Z][A-Za-z0-9. ]+?)(?:\s*\(([^)]+)\))?(?:[:\s,—\u2013-]|$)/,
  );
  if (atMatch) {
    return {
      recentRole: atMatch[1].trim(),
      recentCompany: atMatch[2].trim(),
      recentCompanyDescriptor: atMatch[3]?.trim() ?? null,
    };
  }

  // Try "{Company}:" pattern — e.g., "Acme: built the entire growth infrastructure"
  const colonMatch = firstLine.match(
    /^([A-Z][A-Za-z0-9. ]+?)(?:\s*\(([^)]+)\))?\s*[:—\u2013-]\s*(.+)/,
  );
  if (colonMatch) {
    return {
      recentCompany: colonMatch[1].trim(),
      recentCompanyDescriptor: colonMatch[2]?.trim() ?? null,
      recentRole: colonMatch[3].trim(),
    };
  }

  // Try legacy "Career: CompanyA (role, ...) -> CompanyB" — extract first company
  const legacyCareerMatch = firstLine.match(
    /^([A-Z][A-Za-z0-9. ]+?)\s*\(([^)]+)\)/,
  );
  if (legacyCareerMatch) {
    const companyName = legacyCareerMatch[1].trim();
    const details = legacyCareerMatch[2].trim();
    // Extract role from parenthetical (e.g., "GTM Eng, left March 2026")
    const role = details.split(",")[0]?.trim() ?? null;
    return {
      recentCompany: companyName,
      recentCompanyDescriptor: null,
      recentRole: role,
    };
  }

  return empty;
}

/** Split text on newline/bullet markers into trimmed non-empty strings. */
function splitBullets(text: string): string[] {
  return text
    .split(/\n[-*]|\n\d+\./)
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}
