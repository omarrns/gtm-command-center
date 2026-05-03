import type { LanguageModelUsage, UIMessage } from "ai";
import { aiUsageTokensFrom, captureAiCall } from "@/lib/ai/calls";

export async function captureOnboardingStream(input: {
  usage: PromiseLike<LanguageModelUsage>;
  userId: string;
  interviewId: string;
  callPurpose: string;
  model: string;
  systemPrompt: string;
  messages: UIMessage[];
  finalMessages: UIMessage[];
  startedAt?: number;
}) {
  await captureAiCall(
    {
      userId: input.userId,
      scopeTable: "onboarding_interviews",
      scopeId: input.interviewId,
      callPurpose: input.callPurpose,
    },
    {
      model: input.model,
      callKind: "text",
      systemPrompt: input.systemPrompt,
      userPrompt: JSON.stringify(input.messages),
      responseText: JSON.stringify(input.finalMessages.at(-1) ?? null),
      ...(await aiUsageTokensFrom(input.usage)),
      latencyMs: input.startedAt ? Date.now() - input.startedAt : undefined,
    },
  );
}
