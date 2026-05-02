import type { gmail_v1 } from "googleapis";

export interface LatestInboundReply {
  gmailMessageId: string;
  body: string | null;
}

export interface FindInboundReplyInput {
  originalMessageId: string | null;
  senderAddress: string | null;
}

export async function fetchLatestInboundReply(
  gmail: gmail_v1.Gmail,
  threadId: string,
  input: FindInboundReplyInput,
): Promise<LatestInboundReply | null> {
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  return findLatestInboundReply(thread.data, input);
}

export function findLatestInboundReply(
  thread: gmail_v1.Schema$Thread,
  input: FindInboundReplyInput,
): LatestInboundReply | null {
  const messages = [...(thread.messages ?? [])].sort((a, b) => {
    return Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0);
  });

  for (const message of messages) {
    if (!message.id || message.id === input.originalMessageId) continue;
    if (isFromSender(message, input.senderAddress)) continue;

    return {
      gmailMessageId: message.id,
      body: extractMessageText(message),
    };
  }

  return null;
}

export function extractMessageText(
  message: gmail_v1.Schema$Message,
): string | null {
  const plainText = collectParts(message.payload, "text/plain")
    .map(decodeBody)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n\n")
    .trim();

  if (plainText) return plainText;

  const htmlText = collectParts(message.payload, "text/html")
    .map(decodeBody)
    .filter((text): text is string => Boolean(text?.trim()))
    .map(htmlToText)
    .join("\n\n")
    .trim();

  return htmlText || null;
}

function collectParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string,
): gmail_v1.Schema$MessagePart[] {
  if (!part) return [];

  const matches = part.mimeType === mimeType ? [part] : [];
  for (const child of part.parts ?? []) {
    matches.push(...collectParts(child, mimeType));
  }
  return matches;
}

function decodeBody(part: gmail_v1.Schema$MessagePart): string | null {
  const data = part.body?.data;
  if (!data) return null;

  try {
    return Buffer.from(toBase64(data), "base64").toString("utf8");
  } catch {
    return null;
  }
}

function toBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function isFromSender(
  message: gmail_v1.Schema$Message,
  senderAddress: string | null,
): boolean {
  if (!senderAddress) return false;

  const from = message.payload?.headers?.find((header) => {
    return header.name?.toLowerCase() === "from";
  })?.value;

  return normalizeEmail(from) === normalizeEmail(senderAddress);
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}
