import { NextRequest, NextResponse } from "next/server";
import { storeTokens } from "@/lib/whoop/client";
import type { WhoopTokenResponse } from "@/lib/whoop/types";

// Get the base URL for redirects
function getBaseUrl(request: NextRequest): string {
  // Use NEXT_PUBLIC_APP_URL if set, otherwise construct from request
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Fallback to request origin
  const origin = request.nextUrl.origin;
  return origin;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // This is the user_id
  const error = searchParams.get("error");
  const baseUrl = getBaseUrl(request);

  console.log("[Whoop Callback] Received callback, state:", state ? "present" : "missing");

  // Handle errors from Whoop
  if (error) {
    const errorDescription = searchParams.get("error_description") || "Unknown error";
    console.error("[Whoop Callback] OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      new URL(`/?whoop_error=${encodeURIComponent(errorDescription)}`, baseUrl)
    );
  }

  if (!code) {
    console.error("[Whoop Callback] No authorization code");
    return NextResponse.redirect(
      new URL("/?whoop_error=No authorization code received", baseUrl)
    );
  }

  if (!state) {
    console.error("[Whoop Callback] No state parameter");
    return NextResponse.redirect(
      new URL("/?whoop_error=Invalid state parameter", baseUrl)
    );
  }

  // state contains the user_id
  const userId = state;

  try {
    console.log("[Whoop Callback] Exchanging code for tokens...");

    // Exchange code for tokens with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const tokenResponse = await fetch(
      "https://api.prod.whoop.com/oauth/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: process.env.WHOOP_REDIRECT_URI!,
          client_id: process.env.WHOOP_CLIENT_ID!,
          client_secret: process.env.WHOOP_CLIENT_SECRET!,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[Whoop Callback] Token exchange failed:", tokenResponse.status, errorText);
      return NextResponse.redirect(
        new URL(`/?whoop_error=${encodeURIComponent("Failed to exchange code: " + tokenResponse.status)}`, baseUrl)
      );
    }

    const tokens: WhoopTokenResponse = await tokenResponse.json();
    console.log("[Whoop Callback] Token exchange successful, storing tokens...");

    // Store tokens in database for this user
    await storeTokens(
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    console.log("[Whoop Callback] Tokens stored, redirecting to app");

    // Redirect to app with success
    return NextResponse.redirect(new URL("/?whoop_connected=true", baseUrl));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[Whoop Callback] Error:", isTimeout ? "Request timed out" : errorMessage);
    return NextResponse.redirect(
      new URL(`/?whoop_error=${encodeURIComponent(isTimeout ? "Request timed out" : "Authentication failed")}`, baseUrl)
    );
  }
}
