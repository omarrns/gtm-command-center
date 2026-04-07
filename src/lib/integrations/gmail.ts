/**
 * Gmail API client — send emails, check replies, manage tokens.
 * Uses googleapis library with encrypted refresh token storage.
 */

import { google, type gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/integrations/crypto";

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function createOAuth2(): OAuth2Client {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl}/api/auth/gmail/callback`,
  );
}

/**
 * Build an authenticated Gmail client for a user.
 * Decrypts the stored refresh token, auto-refreshes if needed,
 * and re-encrypts + stores the updated token.
 */
export async function getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
  const svc = createSupabaseServiceClient();

  const { data: creds, error } = await svc
    .from("gmail_credentials")
    .select("encrypted_refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !creds) {
    throw new Error("Gmail not connected — no credentials found");
  }

  const refreshToken = decrypt(creds.encrypted_refresh_token);

  const oauth2 = createOAuth2();
  oauth2.setCredentials({ refresh_token: refreshToken });

  // Force refresh to get a valid access token
  const { credentials } = await oauth2.refreshAccessToken();
  oauth2.setCredentials(credentials);

  // If Google issued a new refresh token, re-encrypt and store it
  if (credentials.refresh_token && credentials.refresh_token !== refreshToken) {
    const newEncrypted = encrypt(credentials.refresh_token);
    await svc
      .from("gmail_credentials")
      .update({
        encrypted_refresh_token: newEncrypted,
        token_expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
      })
      .eq("user_id", userId);
  }

  return google.gmail({ version: "v1", auth: oauth2 });
}

// ---------------------------------------------------------------------------
// Send email
// ---------------------------------------------------------------------------

interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  from: string;
}

interface SendEmailResult {
  threadId: string;
  messageId: string;
}

/**
 * Strip CR/LF from header values to prevent header injection attacks.
 */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

/**
 * Send an email via Gmail API. Returns thread + message IDs for tracking.
 */
export async function sendEmail(
  gmail: gmail_v1.Gmail,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const from = sanitizeHeader(input.from);
  const to = sanitizeHeader(input.to);
  const subject = sanitizeHeader(input.subject);

  // Build RFC 2822 message with sanitized headers
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ];
  const rawMessage = messageParts.join("\r\n");

  // Base64url encode for Gmail API
  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  if (!res.data.id || !res.data.threadId) {
    throw new Error("Gmail send returned no message/thread ID");
  }

  return {
    threadId: res.data.threadId,
    messageId: res.data.id,
  };
}

// ---------------------------------------------------------------------------
// Reply tracking (metadata only — no message body access)
// ---------------------------------------------------------------------------

interface ThreadReplyStatus {
  threadId: string;
  hasReply: boolean;
}

/**
 * Batch check threads for replies. Uses gmail.metadata scope —
 * only checks message count per thread, never reads message bodies.
 */
export async function checkReplies(
  gmail: gmail_v1.Gmail,
  threadIds: string[],
): Promise<ThreadReplyStatus[]> {
  const results: ThreadReplyStatus[] = [];

  for (const threadId of threadIds) {
    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "minimal", // metadata only — no body content
      });

      // Original send = 1 message. Reply = 2+ messages.
      const messageCount = thread.data.messages?.length ?? 0;
      results.push({ threadId, hasReply: messageCount > 1 });
    } catch (err) {
      // Thread may have been deleted — treat as no reply
      console.error(`Failed to check thread ${threadId}:`, err);
      results.push({ threadId, hasReply: false });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Token revocation
// ---------------------------------------------------------------------------

/**
 * Revoke Gmail token with Google and delete credentials from DB.
 */
export async function revokeToken(userId: string): Promise<void> {
  const svc = createSupabaseServiceClient();

  // Best-effort revoke with Google — decrypt/revoke failures must never
  // prevent local credential deletion
  try {
    const { data: creds } = await svc
      .from("gmail_credentials")
      .select("encrypted_refresh_token")
      .eq("user_id", userId)
      .single();

    if (creds) {
      const refreshToken = decrypt(creds.encrypted_refresh_token);
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
        { method: "POST" },
      );
    }
  } catch (err) {
    // Swallowed intentionally — local cleanup below must always run
    console.error("Google token revocation failed (non-blocking):", err);
  }

  // Always delete credentials + clear display email, even if revoke failed
  const { error: deleteError } = await svc
    .from("gmail_credentials")
    .delete()
    .eq("user_id", userId);
  if (deleteError) {
    throw new Error(
      `Failed to remove stored credentials: ${deleteError.message}`,
    );
  }

  const { error: clearError } = await svc
    .from("pipeline_config")
    .update({ gmail_send_address: null })
    .eq("user_id", userId);
  if (clearError) {
    throw new Error(`Failed to clear Gmail address: ${clearError.message}`);
  }
}
