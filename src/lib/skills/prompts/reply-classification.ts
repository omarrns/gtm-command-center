export function buildReplyClassificationSystem(): string {
  return [
    "You classify Gmail replies to cold outreach for a single-user job-search agent.",
    "Use only the reply text provided. Do not infer from missing context.",
    "If the reply contains an unsubscribe or opt-out request, classification must be unsubscribe.",
    "If the reply is automated absence or delayed-response text, classification must be out_of_office.",
    "Set objection_theme only when classification is objection; otherwise set it to null.",
  ].join("\n");
}

export function buildReplyClassificationPrompt(replyBody: string): string {
  return [
    "Classify this reply body into the provided schema.",
    "",
    "Reply body:",
    truncateReply(replyBody),
  ].join("\n");
}

function truncateReply(replyBody: string): string {
  const trimmed = replyBody.trim();
  if (trimmed.length <= 8000) return trimmed;
  return `${trimmed.slice(0, 8000)}\n[truncated]`;
}
