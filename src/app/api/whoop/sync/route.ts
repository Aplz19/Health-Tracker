import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  getValidAccessToken,
  fetchCycles,
  fetchRecoveries,
  fetchSleep,
} from "@/lib/whoop/client";
import type { WhoopRecovery, WhoopSleep } from "@/lib/whoop/types";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Helper to get user from request cookies
async function getUserFromRequest(request: NextRequest) {
  const serverSupabase = createServerClient(
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
  const { data: { user } } = await serverSupabase.auth.getUser();
  return user;
}

// Convert milliseconds to minutes
function msToMinutes(ms: number): number {
  return Math.round(ms / 60000);
}

// Get the date string from an ISO timestamp (in local timezone based on offset)
function getDateFromTimestamp(timestamp: string, offset?: string): string {
  const date = new Date(timestamp);
  // Simple extraction - just use the date portion
  return date.toISOString().split("T")[0];
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const accessToken = await getValidAccessToken(user.id);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not connected to Whoop" },
        { status: 401 }
      );
    }

    // Parse request body for date range
    const body = await request.json().catch(() => ({}));
    const days = body.days || 7;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    // Fetch all data in parallel using v2 standalone endpoints
    const [cycles, recoveries, sleeps] = await Promise.all([
      fetchCycles(accessToken, startStr, endStr),
      fetchRecoveries(accessToken, startStr, endStr),
      fetchSleep(accessToken, startStr, endStr),
    ]);

    if (cycles.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        message: "No cycles found for date range",
        dateRange: { start: startStr, end: endStr },
      });
    }

    // Create lookup maps by cycle_id
    const recoveryByCycle = new Map<number, WhoopRecovery>();
    for (const recovery of recoveries) {
      recoveryByCycle.set(recovery.cycle_id, recovery);
    }

    const sleepByCycle = new Map<number, WhoopSleep>();
    for (const sleep of sleeps) {
      if (sleep.cycle_id) {
        sleepByCycle.set(sleep.cycle_id, sleep);
      }
    }

    // Process and store data
    const supabase = getSupabase();
    const processedData = [];

    for (const cycle of cycles) {
      if (!cycle.start) continue;

      const cycleDate = getDateFromTimestamp(cycle.start);
      const recovery = recoveryByCycle.get(cycle.id);
      const sleep = sleepByCycle.get(cycle.id);

      // Calculate sleep duration from sleep data
      let sleepDurationMinutes: number | null = null;
      let sleepScore: number | null = null;

      if (sleep?.score) {
        const totalSleepMs =
          (sleep.score.stage_summary?.total_light_sleep_time_milli || 0) +
          (sleep.score.stage_summary?.total_slow_wave_sleep_time_milli || 0) +
          (sleep.score.stage_summary?.total_rem_sleep_time_milli || 0);
        sleepDurationMinutes = msToMinutes(totalSleepMs);
        sleepScore = Math.round(sleep.score.sleep_performance_percentage || 0);
      }

      const dayData = {
        user_id: user.id,
        date: cycleDate,
        cycle_id: cycle.id,
        recovery_score: recovery?.score?.recovery_score ?? null,
        hrv_rmssd: recovery?.score?.hrv_rmssd_milli ?? null,
        resting_heart_rate: recovery?.score?.resting_heart_rate ?? null,
        spo2_percentage: recovery?.score?.spo2_percentage ?? null,
        skin_temp_celsius: recovery?.score?.skin_temp_celsius ?? null,
        sleep_id: sleep?.id ?? null,
        sleep_score: sleepScore,
        sleep_duration_minutes: sleepDurationMinutes,
        strain_score: cycle.score?.strain ?? null,
        kilojoules: cycle.score?.kilojoule ?? null,
        avg_heart_rate: cycle.score?.average_heart_rate ?? null,
        max_heart_rate: cycle.score?.max_heart_rate ?? null,
        raw_data: {
          cycle,
          recovery: recovery ?? null,
          sleep: sleep ?? null,
        },
        updated_at: new Date().toISOString(),
      };

      processedData.push(dayData);
    }

    // Upsert data into database
    if (processedData.length > 0) {
      const { error } = await supabase
        .from("whoop_data")
        .upsert(processedData, { onConflict: "user_id,date" });

      if (error) {
        console.error("Database upsert error:", error);
        return NextResponse.json(
          { error: "Failed to save data" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      synced: processedData.length,
      dateRange: { start: startStr, end: endStr },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch cached data for a specific date
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json(
      { error: "Date parameter required" },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("whoop_data")
      .select("*")
      .eq("date", date)
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found"
      console.error("Database fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch data" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || null });
  } catch (err) {
    console.error("Fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
