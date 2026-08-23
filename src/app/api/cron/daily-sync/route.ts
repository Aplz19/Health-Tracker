import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncDailySummary } from "@/lib/daily-summary/aggregate";
import { SUMMARY_TIME_ZONE, addDays, dateRange, previousLocalDate } from "@/lib/daily-summary/date";

// Vercel Cron (UTC) -- see vercel.json. Runs after the Whoop sync so that a
// day's strain is final before it is summarized.
export const maxDuration = 60;

/**
 * Re-summarize a trailing window rather than only yesterday.
 *
 * Two reasons, both real:
 *  - Strain accumulates all day and is only finalized by a later Whoop sync,
 *    so a summary written once can capture a stale, understated value.
 *  - Landon routinely reopens the previous day to fill in habits he forgot.
 *    A write-once summary would never see those edits.
 *
 * Aggregation is deterministic and idempotent, so re-running a day is free.
 */
const DEFAULT_WINDOW_DAYS = 3;

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

    const params = request.nextUrl.searchParams;

    // Summarize days that have ENDED in the user's timezone -- never
    // `new Date()`, which is the UTC date and has already rolled over.
    const requested = params.get("date");
    if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const windowDays = Math.min(Math.max(Number(params.get("days") ?? DEFAULT_WINDOW_DAYS), 1), 14);
    const lastDay = previousLocalDate();
    const dates = requested ? [requested] : dateRange(addDays(lastDay, -(windowDays - 1)), lastDay);

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
        dates,
        timeZone: SUMMARY_TIME_ZONE,
        message: "No users to sync",
        synced: 0,
      });
    }

    const failures: { userId: string; date: string; error: string }[] = [];
    let synced = 0;

    for (const userId of userIds) {
      for (const date of dates) {
        try {
          await syncDailySummary(date, userId);
          synced++;
        } catch (err) {
          failures.push({
            userId,
            date,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: failures.length === 0,
        dates,
        timeZone: SUMMARY_TIME_ZONE,
        users: userIds.length,
        message: `Summarized ${synced}/${userIds.length * dates.length} user-days`,
        synced,
        // Surface failures rather than reporting a clean 200 over a broken run.
        ...(failures.length ? { failures } : {}),
      },
      { status: failures.length ? 500 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
