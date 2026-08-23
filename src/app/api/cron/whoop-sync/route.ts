import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SYNC_LOOKBACK_DAYS, syncWhoopRange } from "@/lib/whoop/sync";
import { syncBodyMeasurement } from "@/lib/whoop/body";
import { addDays, localDateString } from "@/lib/daily-summary/date";

// Called by Vercel Cron daily -- see vercel.json.
// Runs BEFORE the daily summary so a day's strain is final before aggregation.
//
// Since webhooks landed (src/app/api/whoop/webhook/route.ts) this is no longer
// the primary path for sleep/recovery/workouts -- those arrive within seconds
// of being scored. It stays for two reasons:
//   1. STRAIN. There is no cycle webhook, so the only way to learn a day's
//      final strain is to ask.
//   2. RECONCILE. Webhooks get missed -- a deploy window, a delivery failure,
//      a 500 from us. One daily pass over a trailing window repairs anything
//      dropped, for about four API calls out of a 10,000/day budget.
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fail closed: the anon key reads nothing through RLS, which previously meant
  // a "successful" run that wrote nothing.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for the Whoop sync" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tokenRecords, error: tokensError } = await supabase
      .from("whoop_tokens")
      .select("user_id");
    if (tokensError) throw tokensError;

    const userIds = (tokenRecords || []).map((t) => t.user_id);
    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with Whoop connected",
        synced: 0,
        total: 0,
      });
    }

    // Look back far enough that a recovery scored after the cycle appeared
    // still gets collected. Merging means re-syncing a day is safe.
    const today = localDateString(new Date());
    const startStr = addDays(today, -DEFAULT_SYNC_LOOKBACK_DAYS);

    const results: {
      userId: string;
      success: boolean;
      days?: number;
      withRecovery?: number;
      body?: string;
      error?: string;
    }[] = [];

    for (const userId of userIds) {
      try {
        const r = await syncWhoopRange(supabase, userId, startStr, today);
        // WHOOP exposes only a current snapshot of body weight, so sampling it
        // once a day is how a series gets built. Never fatal: a token issued
        // before read:body_measurement simply reports skipped.
        const body = await syncBodyMeasurement(supabase, userId);
        results.push({
          userId,
          success: true,
          days: r.days,
          withRecovery: r.withRecovery,
          body: body.status === "stored" ? `${body.weightLb} lb` : `skipped: ${body.reason}`,
        });
      } catch (err) {
        results.push({
          userId,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const failures = results.filter((r) => !r.success);

    return NextResponse.json(
      {
        success: failures.length === 0,
        message: `Whoop sync completed for ${results.length - failures.length}/${userIds.length} users`,
        range: { start: startStr, end: today },
        results,
        timestamp: new Date().toISOString(),
      },
      { status: failures.length ? 500 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync";
    console.error("Whoop cron sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
