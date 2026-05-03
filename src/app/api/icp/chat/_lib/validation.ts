import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import {
  icpChatRequestSchema,
  icpChatSessionCreateSchema,
} from "@/lib/icp-agent/schemas";

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export async function parseIcpChatRequest(
  req: Request,
): Promise<ParseResult<{ sessionId: string; messages: UIMessage[] }>> {
  const body = await parseJson(req, icpChatRequestSchema);
  if (!body.ok) return body;

  const messages = await safeValidateUIMessages<UIMessage>({
    messages: body.data.messages,
  });
  if (!messages.success) return badRequest("Invalid chat messages.");

  return {
    ok: true,
    data: { sessionId: body.data.sessionId, messages: messages.data },
  };
}

export function parseCreateSessionRequest(req: Request) {
  return parseJson(req, icpChatSessionCreateSchema);
}

async function parseJson<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return badRequest("Invalid request body.");
  return { ok: true, data: parsed.data };
}

function badRequest(message: string): ParseResult<never> {
  return {
    ok: false,
    response: Response.json({ error: message }, { status: 400 }),
  };
}
