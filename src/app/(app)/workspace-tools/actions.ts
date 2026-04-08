"use server";

import { requireUser } from "@/lib/supabase/server";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  buildCreatePromptSystem,
  buildCreatePromptPrompt,
} from "@/lib/skills/prompts/create-prompt";
import {
  buildCreateSkillSystem,
  buildCreateSkillPrompt,
} from "@/lib/skills/prompts/create-skill";

export async function generatePromptAction(formData: FormData) {
  const user = await requireUser();

  const inputs: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const v = String(value).trim();
    if (v) inputs[key] = v;
  }

  if (!inputs.task) return { error: "Task field is required." };

  const ctx = await loadMemoryContext(user.id);
  const sender = extractSenderIdentity(ctx, ctx.displayName);

  const result = await runClaudeJson<{
    title: string;
    markdown: string;
    notes: string;
  }>({
    system: buildCreatePromptSystem(sender),
    prompt: buildCreatePromptPrompt(inputs),
    maxTokens: 4096,
  });

  return { result };
}

export async function generateSkillAction(formData: FormData) {
  const user = await requireUser();

  const inputs: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    const v = String(value).trim();
    if (v) inputs[key] = v;
  }

  if (!inputs.name) return { error: "Name field is required." };

  const ctx = await loadMemoryContext(user.id);
  const sender = extractSenderIdentity(ctx, ctx.displayName);

  const result = await runClaudeJson<{
    slug: string;
    title: string;
    markdown: string;
    notes: string;
  }>({
    system: buildCreateSkillSystem(sender),
    prompt: buildCreateSkillPrompt(inputs),
    maxTokens: 4096,
  });

  return { result };
}
