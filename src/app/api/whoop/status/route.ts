import { NextResponse } from "next/server";
import { getStoredTokens, isTokenExpired, getValidAccessToken } from "@/lib/whoop/client";

export async function GET() {
  try {
    const tokens = await getStoredTokens();

    if (!tokens) {
      return NextResponse.json({ connected: false });
    }

    // Check if we can get a valid token (will refresh if needed)
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      expiresAt: tokens.expires_at,
      isExpiringSoon: isTokenExpired(tokens),
    });
  } catch (err) {
    console.error("Status check error:", err);
    return NextResponse.json({ connected: false, error: "Failed to check status" });
  }
}
