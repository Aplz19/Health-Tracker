import { NextRequest, NextResponse } from "next/server";
import { storeTokens } from "@/lib/whoop/client";
import type { WhoopTokenResponse } from "@/lib/whoop/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // This is the user_id
  const error = searchParams.get("error");

  // Handle errors from Whoop
  if (error) {
    const errorDescription = searchParams.get("error_description") || "Unknown error";
    return NextResponse.redirect(
      new URL(`/?whoop_error=${encodeURIComponent(errorDescription)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?whoop_error=No authorization code received", request.url)
    );
  }

  if (!state) {
    return NextResponse.redirect(
      new URL("/?whoop_error=Invalid state parameter", request.url)
    );
  }

  // state contains the user_id
  const userId = state;

  try {
    // Exchange code for tokens
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
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(
        new URL("/?whoop_error=Failed to exchange authorization code", request.url)
      );
    }

    const tokens: WhoopTokenResponse = await tokenResponse.json();

    // Store tokens in database for this user
    await storeTokens(
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    // Redirect to app with success
    return NextResponse.redirect(new URL("/?whoop_connected=true", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/?whoop_error=Authentication failed", request.url)
    );
  }
}
