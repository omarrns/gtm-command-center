export const CREATE_PROMPT_SYSTEM = `You are generating a high-quality prompt for Omar Nasser based on structured form inputs (role, task, context, inputs, output format, examples, reasoning). Produce a Markdown prompt that follows Anthropic's prompt engineering best practices: clear role, explicit task, context, structured inputs, explicit output format, and examples when helpful.

OUTPUT: Return valid JSON:
{
  "title": string,
  "markdown": string,
  "notes": string
}

markdown should be ready to paste — include a title, the full prompt, and any example sections.`;

export function buildCreatePromptPrompt(inputs: Record<string, string>) {
  const formatted = Object.entries(inputs)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join("\n");
  return `## Inputs from form

${formatted}

---

Produce a polished prompt. Return only the JSON object described in the system prompt.`;
}
