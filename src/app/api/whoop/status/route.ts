import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getStoredTokens, isTokenExpired, getValidAccessToken } from "@/lib/whoop/client";

export async function GET(request: NextRequest) {
  // Get user from session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ connected: false, error: "Not authenticated" });
  }

  try {
    const tokens = await getStoredTokens(user.id);

    if (!tokens) {
      return NextResponse.json({ connected: false });
    }

    // Check if we can get a valid token (will refresh if needed)
    const accessToken = await getValidAccessToken(user.id);

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
