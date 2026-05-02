import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { SignJWT } from "jose";
import { requireUser } from "@/lib/supabase/server";
import { GMAIL_SCOPES } from "@/lib/integrations/gmail-scopes";

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

  // Preserve return URL so callback redirects back to the right page
  const returnTo = request.nextUrl.searchParams.get("return_to");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  // PKCE: generate code_verifier and code_challenge
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // State: signed JWT with userId + nonce for CSRF protection
  const nonce = randomBytes(16).toString("hex");
  const state = await new SignJWT({ userId: user.id, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(getJwtSecret());

  // Store nonce + code_verifier in httpOnly cookies
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes
  };

  cookieStore.set("gmail_oauth_nonce", nonce, cookieOptions);
  cookieStore.set("gmail_oauth_verifier", codeVerifier, cookieOptions);
  if (returnTo) {
    cookieStore.set("gmail_oauth_return_to", returnTo, cookieOptions);
  }

  const redirectUri = `${getAppUrl()}/api/auth/gmail/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
