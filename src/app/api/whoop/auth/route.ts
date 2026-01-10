import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Whoop credentials not configured" },
      { status: 500 }
    );
  }

  // Generate state for CSRF protection
  const state = crypto.randomUUID();

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read:recovery read:cycles read:sleep read:workout read:profile offline",
    state: state,
  });

  const authUrl = `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`;

  // Redirect to Whoop authorization page
  return NextResponse.redirect(authUrl);
}
