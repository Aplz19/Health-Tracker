import { NextRequest, NextResponse } from "next/server";
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
    // Sync today's data
    const today = format(new Date(), "yyyy-MM-dd");
    const data = await syncDailySummary(today);

    return NextResponse.json({
      success: true,
      date: today,
      message: "Daily summary synced successfully",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
