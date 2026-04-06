"use server";

import { requireUser } from "@/lib/supabase/server";
import { runClaudeJson } from "@/lib/ai/anthropic";
import {
  CREATE_PROMPT_SYSTEM,
  buildCreatePromptPrompt,
} from "@/lib/skills/prompts/create-prompt";
import {
  CREATE_SKILL_SYSTEM,
  buildCreateSkillPrompt,
} from "@/lib/skills/prompts/create-skill";

export async function generatePromptAction(formData: FormData) {
  await requireUser();

  const inputs: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const v = String(value).trim();
    if (v) inputs[key] = v;
  }

  if (!inputs.task) return { error: "Task field is required." };

  const result = await runClaudeJson<{
    title: string;
    markdown: string;
    notes: string;
  }>({
    system: CREATE_PROMPT_SYSTEM,
    prompt: buildCreatePromptPrompt(inputs),
    maxTokens: 4096,
  });

  return { result };
}

export async function generateSkillAction(formData: FormData) {
  await requireUser();

  const inputs: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const v = String(value).trim();
    if (v) inputs[key] = v;
  }

  if (!inputs.name) return { error: "Name field is required." };

  const result = await runClaudeJson<{
    slug: string;
    title: string;
    markdown: string;
    notes: string;
  }>({
    system: CREATE_SKILL_SYSTEM,
    prompt: buildCreateSkillPrompt(inputs),
    maxTokens: 4096,
  });

  return { result };
}
