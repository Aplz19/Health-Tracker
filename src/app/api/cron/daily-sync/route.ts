import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncDailySummary } from "@/lib/daily-summary/aggregate";
import { format } from "date-fns";

// This endpoint is called by Vercel Cron at 11:59 PM daily
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (security)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all users
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get distinct user_ids from recent data (users who have logged something)
    const { data: users, error: usersError } = await supabase
      .from("meals")
      .select("user_id")
      .limit(1000);

    if (usersError) {
      throw usersError;
    }

    // Get unique user IDs
    const userIds = [...new Set((users || []).map(u => u.user_id))];

    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        date: format(new Date(), "yyyy-MM-dd"),
        message: "No users to sync",
        synced: 0,
      });
    }

    // Sync today's data for all users
    const today = format(new Date(), "yyyy-MM-dd");
    const results = [];

    for (const userId of userIds) {
      try {
        await syncDailySummary(today, userId);
        results.push({ userId, success: true });
      } catch (err) {
        results.push({ userId, success: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      date: today,
      message: `Daily summary synced for ${successCount}/${userIds.length} users`,
      synced: successCount,
      total: userIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
