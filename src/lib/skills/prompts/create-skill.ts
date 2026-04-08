import type { SenderIdentity } from "../sender-identity";

export function buildCreateSkillSystem(sender: SenderIdentity): string {
  return `You are generating a Claude Code SKILL.md spec for ${sender.fullName} based on structured form inputs. Produce a Markdown file with the YAML frontmatter Claude Code expects:

---
name: <kebab-case-slug>
description: <one-line trigger description>
---

# <Title>

<body with: When to use, Prerequisites, Step-by-step, Output format, Important principles>

OUTPUT: Return valid JSON:
{
  "slug": string,
  "title": string,
  "markdown": string,
  "notes": string
}`;
}

export function buildCreateSkillPrompt(inputs: Record<string, string>) {
  const formatted = Object.entries(inputs)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join("\n");
  return `## Inputs from form

${formatted}

---

Produce a polished SKILL.md. Return only the JSON object described in the system prompt.`;
}
