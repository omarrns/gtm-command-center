import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encrypt } from "@/lib/integrations/crypto";
import { parseGrantedScopes } from "@/lib/integrations/gmail-scopes";

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY is required");
  return new TextEncoder().encode(secret);
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const appUrl = getAppUrl();

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=missing_params`,
    );
  }

  // Validate state JWT
  const cookieStore = await cookies();
  const nonce = cookieStore.get("gmail_oauth_nonce")?.value;
  const codeVerifier = cookieStore.get("gmail_oauth_verifier")?.value;

  if (!nonce || !codeVerifier) {
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=expired_session`,
    );
  }

  // Clear OAuth cookies
  cookieStore.delete("gmail_oauth_nonce");
  cookieStore.delete("gmail_oauth_verifier");

  let statePayload: { userId: string; nonce: string };
  try {
    const { payload } = await jwtVerify(state, getJwtSecret());
    statePayload = payload as unknown as { userId: string; nonce: string };
  } catch {
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=invalid_state`,
    );
  }

  // Verify nonce and user binding
  if (statePayload.nonce !== nonce || statePayload.userId !== user.id) {
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=state_mismatch`,
    );
  }

  // Exchange code for tokens via PKCE
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/auth/gmail/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("Gmail token exchange failed:", errBody);
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=token_exchange_failed`,
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=no_refresh_token`,
    );
  }

  // Get user's Gmail address using the access token
  const profileRes = await fetch(
    "https://www.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );

  let gmailAddress = user.email ?? "";
  if (profileRes.ok) {
    const profile = (await profileRes.json()) as { emailAddress: string };
    gmailAddress = profile.emailAddress;
  }

  // Encrypt and store refresh token
  const encryptedToken = encrypt(tokens.refresh_token);
  const tokenExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const svc = createSupabaseServiceClient();

  // Upsert gmail_credentials
  const { error: credError } = await svc.from("gmail_credentials").upsert(
    {
      user_id: user.id,
      encrypted_refresh_token: encryptedToken,
      token_expires_at: tokenExpiresAt,
      granted_scopes: parseGrantedScopes(tokens.scope),
    },
    { onConflict: "user_id" },
  );

  if (credError) {
    console.error("Failed to store Gmail credentials:", credError.message);
    return NextResponse.redirect(
      `${appUrl}/settings?gmail_error=storage_failed`,
    );
  }

  // Store display email in pipeline_config
  await svc
    .from("pipeline_config")
    .update({ gmail_send_address: gmailAddress })
    .eq("user_id", user.id);

  // Redirect back to the page that initiated OAuth (onboarding or settings)
  const returnTo = cookieStore.get("gmail_oauth_return_to")?.value;
  cookieStore.delete("gmail_oauth_return_to");

  const redirectUrl = returnTo
    ? `${appUrl}${returnTo}`
    : `${appUrl}/settings?gmail_connected=true`;

  return NextResponse.redirect(redirectUrl);
}
