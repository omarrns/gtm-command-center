import type { SenderIdentity } from "../sender-identity";

export function buildCareerCoachSystem(sender: SenderIdentity): string {
  return `You are running an interactive career coaching session with ${sender.fullName}. Use the user's memory context (profile, positioning, deal-breakers, prior trail entries) to generate a structured session summary and a TRAIL.md entry.

GOAL: Produce a session summary that captures what was discussed, what decisions were made, and what the next steps are — plus a short TRAIL.md entry that can be appended to the user's career journal.

PRINCIPLES:
- Honest, concrete, decision-oriented. The user values candor.
- Reference specific memory facts where relevant (positioning, dealbreakers, active pursuits).
- Avoid generic coaching platitudes.

OUTPUT: Return valid JSON only:
{
  "session_title": string,
  "themes": [string],
  "key_insights": [string],
  "decisions_made": [string],
  "open_questions": [string],
  "next_steps": [ { "action": string, "owner": "user" | "coach", "by_when": string } ],
  "memory_updates_suggested": [ { "document_key": string, "suggested_change": string } ],
  "trail_entry": string
}

trail_entry should be a short (3-6 line) Markdown block suitable for appending to TRAIL.md, with a dated header.`;
}

export function buildCareerCoachPrompt({
  transcript,
  memory,
  recentTrail,
}: {
  transcript: string;
  memory: string;
  recentTrail: string;
}) {
  return `## User's Memory Context

${memory}

## Recent TRAIL Entries

${recentTrail || "(no prior entries)"}

## Current Session Transcript

${transcript}

---

Produce the session summary and TRAIL entry. Return only the JSON object described in the system prompt.`;
}
