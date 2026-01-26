import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getValidAccessToken,
  fetchCycles,
  fetchRecoveries,
  fetchSleep,
} from "@/lib/whoop/client";
import type { WhoopRecovery, WhoopSleep } from "@/lib/whoop/types";

// This endpoint is called by Vercel Cron every hour to sync Whoop data for all users

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Convert milliseconds to minutes
function msToMinutes(ms: number): number {
  return Math.round(ms / 60000);
}

// Get the date string from an ISO timestamp
function getDateFromTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toISOString().split("T")[0];
}

// Sync Whoop data for a single user
async function syncUserWhoopData(userId: string): Promise<{ synced: number }> {
  const accessToken = await getValidAccessToken(userId);

  if (!accessToken) {
    throw new Error("No valid access token");
  }

  // Sync last 2 days to catch any late-arriving data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 2);

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  // Fetch all data in parallel
  const [cycles, recoveries, sleeps] = await Promise.all([
    fetchCycles(accessToken, startStr, endStr),
    fetchRecoveries(accessToken, startStr, endStr),
    fetchSleep(accessToken, startStr, endStr),
  ]);

  if (cycles.length === 0) {
    return { synced: 0 };
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
      user_id: userId,
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
      throw new Error(`Database error: ${error.message}`);
    }
  }

  return { synced: processedData.length };
}

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // Get all users with Whoop tokens
    const { data: tokenRecords, error: tokensError } = await supabase
      .from("whoop_tokens")
      .select("user_id");

    if (tokensError) {
      throw tokensError;
    }

    const userIds = (tokenRecords || []).map((t) => t.user_id);

    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with Whoop connected",
        synced: 0,
        total: 0,
      });
    }

    // Sync each user's Whoop data
    const results: { userId: string; success: boolean; synced?: number; error?: string }[] = [];

    for (const userId of userIds) {
      try {
        const { synced } = await syncUserWhoopData(userId);
        results.push({ userId, success: true, synced });
      } catch (err) {
        results.push({
          userId,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0);

    return NextResponse.json({
      success: true,
      message: `Whoop sync completed for ${successCount}/${userIds.length} users`,
      syncedUsers: successCount,
      totalUsers: userIds.length,
      totalRecords: totalSynced,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync";
    console.error("Whoop cron sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
