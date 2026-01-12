import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getValidAccessToken } from "@/lib/whoop/client";

const WHOOP_API_BASE = "https://api.prod.whoop.com";

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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const accessToken = await getValidAccessToken(user.id);

    if (!accessToken) {
      return NextResponse.json({ error: "Not connected - no token found" }, { status: 401 });
    }

    const results: Record<string, { status: number; body: string }> = {};

    // Test 1: Get last 3 cycles to find completed ones
    console.log("[Test] Fetching last 3 cycles...");
    const cyclesRes = await fetch(`${WHOOP_API_BASE}/developer/v1/cycle?limit=3`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const cyclesBody = await cyclesRes.text();
    results.cycles = { status: cyclesRes.status, body: cyclesBody.substring(0, 2000) };

    // Parse cycles to find a COMPLETED cycle (end != null) for recovery/sleep test
    let currentCycleId: number | null = null;
    let completedCycleId: number | null = null;
    let allCycles: Array<{ id: number; start: string; end: string | null }> = [];

    if (cyclesRes.ok) {
      try {
        const cyclesData = JSON.parse(cyclesBody);
        if (cyclesData.records && cyclesData.records.length > 0) {
          allCycles = cyclesData.records.map((c: { id: number; start: string; end: string | null }) => ({
            id: c.id,
            start: c.start,
            end: c.end,
          }));
          currentCycleId = cyclesData.records[0].id;
          // Find first completed cycle (end is not null)
          const completedCycle = cyclesData.records.find((c: { end: string | null }) => c.end !== null);
          if (completedCycle) {
            completedCycleId = completedCycle.id;
          }
        }
      } catch {}
    }

    // Test with COMPLETED cycle (should have recovery/sleep)
    if (completedCycleId) {
      console.log(`[Test] Fetching recovery for COMPLETED cycle ${completedCycleId}...`);
      const recoveryRes = await fetch(`${WHOOP_API_BASE}/developer/v1/cycle/${completedCycleId}/recovery`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const recoveryBody = await recoveryRes.text();
      results.completedCycleRecovery = { status: recoveryRes.status, body: recoveryBody.substring(0, 1000) };

      console.log(`[Test] Fetching sleep for COMPLETED cycle ${completedCycleId}...`);
      const sleepRes = await fetch(`${WHOOP_API_BASE}/developer/v1/cycle/${completedCycleId}/sleep`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const sleepBody = await sleepRes.text();
      results.completedCycleSleep = { status: sleepRes.status, body: sleepBody.substring(0, 1000) };
    }

    // Test 4: Get user profile to check token info
    console.log("[Test] Fetching user profile...");
    const profileRes = await fetch(`${WHOOP_API_BASE}/developer/v1/user/profile/basic`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profileBody = await profileRes.text();
    results.profile = { status: profileRes.status, body: profileBody.substring(0, 500) };

    return NextResponse.json({
      success: true,
      currentCycleId,
      completedCycleId,
      allCycles,
      results,
    });
  } catch (err) {
    console.error("[Test] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 }
    );
  }
}
