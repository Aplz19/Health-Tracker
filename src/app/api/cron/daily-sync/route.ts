import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncDailySummary } from "@/lib/daily-summary/aggregate";
import { SUMMARY_TIME_ZONE, previousLocalDate } from "@/lib/daily-summary/date";

// Vercel Cron (UTC) -- see vercel.json. Scheduled comfortably after local
// midnight so the day being summarized is always complete.
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (security)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fail closed. Aggregation reads every user's rows, so it needs the service
  // role key; falling back to anon would read nothing through RLS and quietly
  // write a summary of zeros over real data.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for the daily sync" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Summarize the day that just ended in the user's timezone -- NOT
    // `new Date()`, which is the UTC date and has already rolled over.
    // An explicit ?date= override allows re-running a specific day by hand.
    const requested = request.nextUrl.searchParams.get("date");
    if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    const targetDate = requested ?? previousLocalDate();

    // Enumerate every account, not just whoever appears in the first page of
    // meals: a user who logs only habits or supplements has no meal rows, and
    // the old `.limit(1000)` scrape would silently drop users as data grew.
    const userIds: string[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userIds.push(...data.users.map((u) => u.id));
      if (data.users.length < 200) break;
    }

    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        date: targetDate,
        timeZone: SUMMARY_TIME_ZONE,
        message: "No users to sync",
        synced: 0,
      });
    }

    const results = [];
    for (const userId of userIds) {
      try {
        await syncDailySummary(targetDate, userId);
        results.push({ userId, success: true });
      } catch (err) {
        results.push({
          userId,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const failures = results.filter((r) => !r.success);
    const successCount = results.length - failures.length;

    return NextResponse.json({
      success: failures.length === 0,
      date: targetDate,
      timeZone: SUMMARY_TIME_ZONE,
      message: `Daily summary synced for ${successCount}/${userIds.length} users`,
      synced: successCount,
      total: userIds.length,
      // Surface failures rather than reporting a clean 200 over a broken run.
      ...(failures.length ? { failures } : {}),
    }, { status: failures.length ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
