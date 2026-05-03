import { convertToModelMessages, gateway, streamText } from "ai";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { MODELS } from "@/lib/ai/models";
import { aiUsageTokensFrom, captureAiCall } from "@/lib/ai/calls";
import { loadIcpAgentContext } from "@/lib/icp-agent/context";
import { buildIcpChatSystemPrompt } from "@/lib/icp-agent/prompts";
import { replaceSessionMessages } from "@/lib/icp-agent/session-store";
import { parseIcpChatRequest } from "./_lib/validation";

export const maxDuration = 120;

export async function POST(req: Request) {
  const parsed = await parseIcpChatRequest(req);
  if (!parsed.ok) return parsed.response;

  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { sessionId, messages } = parsed.data;

  const { data: session, error } = await svc
    .from("icp_chat_sessions")
    .select("id, user_id, account_name, account_domain, purpose, status")
    .eq("id", sessionId)
    .single();

  if (error || !session || session.user_id !== user.id) {
    return new Response("Session not found", { status: 404 });
  }
  if (session.status !== "active" && session.status !== "completed") {
    return new Response("Session is not active", { status: 400 });
  }

  const context = await loadIcpAgentContext(svc, user.id);
  const system = buildIcpChatSystemPrompt(context);
  const startedAt = Date.now();

  const result = streamText({
    model: gateway(MODELS.icpChat),
    system,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 2048,
    providerOptions: {
      gateway: {
        user: user.id,
        tags: ["feature:icp-chat", "purpose:icp-chat"],
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages, responseMessage }) => {
      await replaceSessionMessages(svc, {
        userId: user.id,
        sessionId,
        messages: finalMessages,
      });
      await captureAiCall(
        {
          userId: user.id,
          scopeTable: "icp_chat_sessions",
          scopeId: sessionId,
          callPurpose: "icp-chat",
        },
        {
          model: MODELS.icpChat,
          callKind: "text",
          systemPrompt: system,
          userPrompt: JSON.stringify(messages),
          responseText: JSON.stringify(responseMessage),
          ...(await aiUsageTokensFrom(result.totalUsage)),
          latencyMs: Date.now() - startedAt,
        },
      );
    },
  });
}
