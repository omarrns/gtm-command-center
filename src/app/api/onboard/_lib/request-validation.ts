import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

const nonEmptyString = z.string().trim().min(1);

const chatRequestSchema = z.object({
  interviewId: nonEmptyString,
  messages: z.array(z.unknown()),
});

const storyStreamRequestSchema = z.object({
  interviewId: nonEmptyString,
});

const artifactRequestSchema = z
  .object({
    interviewId: nonEmptyString.nullable().optional(),
    kind: nonEmptyString.optional(),
    url: nonEmptyString.optional(),
    text: nonEmptyString.optional(),
    urls: z
      .array(
        z.object({
          url: nonEmptyString,
          kind: nonEmptyString,
        }),
      )
      .min(1)
      .optional(),
    sourceLabel: nonEmptyString.optional(),
  })
  .refine(
    (body) => body.urls || (body.kind && (body.url || body.text)),
    "Provide one of: url, text, or urls.",
  );

export type ArtifactRequestBody = z.infer<typeof artifactRequestSchema>;

export async function parseChatRequest(
  req: Request,
): Promise<ParseResult<{ interviewId: string; messages: UIMessage[] }>> {
  const body = await parseJsonBody(req, chatRequestSchema);
  if (!body.ok) return body;

  const messages = await safeValidateUIMessages<UIMessage>({
    messages: body.data.messages,
  });
  if (!messages.success) {
    return badRequest("Invalid chat messages.");
  }

  return {
    ok: true,
    data: {
      interviewId: body.data.interviewId,
      messages: messages.data,
    },
  };
}

export function parseStoryStreamRequest(
  req: Request,
): Promise<ParseResult<{ interviewId: string }>> {
  return parseJsonBody(req, storyStreamRequestSchema);
}

export function parseArtifactRequest(
  req: Request,
): Promise<ParseResult<ArtifactRequestBody>> {
  return parseJsonBody(req, artifactRequestSchema);
}

async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const body = schema.safeParse(raw);
  if (!body.success) {
    return badRequest("Invalid request body.");
  }

  return { ok: true, data: body.data };
}

function badRequest(message: string): ParseResult<never> {
  return {
    ok: false,
    response: Response.json({ error: message }, { status: 400 }),
  };
}
