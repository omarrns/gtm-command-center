import type { SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => {
      return part.type === "text" && typeof part.text === "string";
    })
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function formatMessagesForPrompt(messages: UIMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${messageText(message)}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n\n");
}

export async function replaceSessionMessages(
  svc: SupabaseClient,
  {
    userId,
    sessionId,
    messages,
  }: {
    userId: string;
    sessionId: string;
    messages: UIMessage[];
  },
) {
  await svc
    .from("icp_chat_messages")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);

  if (messages.length === 0) return;

  const rows = messages.map((message, ordinal) => ({
    session_id: sessionId,
    user_id: userId,
    ordinal,
    role: message.role,
    content: messageText(message),
    message: message as unknown as Record<string, unknown>,
  }));

  const { error } = await svc.from("icp_chat_messages").insert(rows);
  if (error) throw new Error(`Failed to save ICP messages: ${error.message}`);
}

export async function insertIcpAgentJob(
  svc: SupabaseClient,
  {
    userId,
    type,
    payload,
  }: {
    userId: string;
    type: string;
    payload: Record<string, unknown>;
  },
): Promise<{ jobId: string }> {
  const { data, error } = await svc
    .from("jobs")
    .insert({ user_id: userId, type, payload })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to enqueue ICP agent job: ${error?.message}`);
  }

  pokeWorker(type).catch(() => {
    /* best-effort */
  });
  return { jobId: data.id as string };
}

async function pokeWorker(type: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const invokeSecret = process.env.WORKER_INVOKE_SECRET;
  await fetch(`${appUrl}/api/worker/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(invokeSecret ? { authorization: `Bearer ${invokeSecret}` } : {}),
    },
    body: JSON.stringify({ types: [type] }),
  });
}
