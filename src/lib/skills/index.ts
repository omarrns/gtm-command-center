/**
 * Skill registry — ported from ~/.claude/skills/ SKILL.md files.
 *
 * Every skill declares a tier:
 *  - tier 1 = direct / sync. Runs inside a Server Action and returns structured JSON within seconds.
 *  - tier 2 = background / async. Enqueues a `jobs` row and is picked up by the worker.
 */

export type SkillTier = 1 | 2;

export interface SkillDefinition {
  slug: string;
  name: string;
  tier: SkillTier;
  phase: 0 | 1 | 2 | 3 | 4;
  summary: string;
  requires?: string[];
}

export const SKILLS: Record<string, SkillDefinition> = {
  "jd-fit-rubric": {
    slug: "jd-fit-rubric",
    name: "JD Fit Rubric",
    tier: 1,
    phase: 1,
    summary:
      "Fast JD-to-resume scoring (no web research). Requirement-by-requirement match with 7-dimension scorecard.",
  },
  "company-fit-analyzer": {
    slug: "company-fit-analyzer",
    name: "Company Fit Analyzer",
    tier: 2,
    phase: 1,
    summary:
      "Company-only strategic fit research with market positioning, founder profile, and outreach angles.",
    requires: ["exa"],
  },
  "full-analysis": {
    slug: "full-analysis",
    name: "Full Analysis",
    tier: 2,
    phase: 1,
    summary:
      "Combined company research + JD scoring + strategic fit + outreach angle in one saved record.",
    requires: ["exa"],
  },
  "email-b2b-customer-support": {
    slug: "email-b2b-customer-support",
    name: "Email — B2B Customer Support CEO",
    tier: 1,
    phase: 2,
    summary:
      "Domain insider cold email to a CEO/founder at a B2B customer support or customer ops company.",
  },
  "email-head-of-growth": {
    slug: "email-head-of-growth",
    name: "Email — Head of Growth",
    tier: 1,
    phase: 2,
    summary: "Stage-matched builder framing cold email for growth leaders.",
  },
  "people-research": {
    slug: "people-research",
    name: "People Research",
    tier: 2,
    phase: 3,
    summary:
      "Exa-backed hiring manager and CEO research with strict attribution gates and source visibility.",
    requires: ["exa"],
  },
  "career-coach": {
    slug: "career-coach",
    name: "Career Coach",
    tier: 2,
    phase: 4,
    summary:
      "Interactive coaching session that reads memory, generates a session summary, and appends a TRAIL.md entry.",
  },
  "create-prompt": {
    slug: "create-prompt",
    name: "Create Prompt",
    tier: 1,
    phase: 4,
    summary: "Generate a high-quality prompt from structured form inputs.",
  },
  "create-skill": {
    slug: "create-skill",
    name: "Create Skill",
    tier: 1,
    phase: 4,
    summary:
      "Generate a Claude Code SKILL.md spec from structured form inputs.",
  },
  "export-chat": {
    slug: "export-chat",
    name: "Export Chat",
    tier: 2,
    phase: 4,
    summary:
      "Export the current Claude Code conversation transcript as a Markdown artifact. Requires sync bridge.",
    requires: ["workspace-sync"],
  },
  "imessage-export": {
    slug: "imessage-export",
    name: "iMessage Export",
    tier: 2,
    phase: 4,
    summary:
      "Export iMessage transcripts. Desktop-only — requires a trusted local sync bridge.",
    requires: ["workspace-sync", "desktop"],
  },
} satisfies Record<string, SkillDefinition>;

export function getSkill(slug: string): SkillDefinition | null {
  return SKILLS[slug] ?? null;
}

export function skillsByPhase(phase: SkillDefinition["phase"]) {
  return Object.values(SKILLS).filter((s) => s.phase === phase);
}
