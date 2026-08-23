import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { syncWhoopRange } from "@/lib/whoop/sync";
import { syncDailySummary } from "@/lib/daily-summary/aggregate";
import { addDays, dateRange, localDateString } from "@/lib/daily-summary/date";

/**
 * WHOOP webhook receiver.
 *
 * WHOOP pushes a NOTIFICATION, not data: the body carries only
 * `{ user_id, id, type, trace_id }`. We still fetch the record ourselves --
 * the win is that we fetch at the moment data is actually ready rather than
 * guessing on a daily schedule.
 *
 * Covers sleep.*, recovery.* and workout.*. There is no cycle event, so STRAIN
 * still depends on the daily cron; that cron stays as the reconcile path for
 * anything a missed webhook would drop.
 *
 * This route is public (see src/proxy.ts) and authenticates every request by
 * HMAC signature instead of a session.
 */
export const maxDuration = 60;

// Re-sync a small window rather than the single record named by the event:
// it reuses the merge-based, idempotent range sync, and costs a couple of
// extra API calls against a 10,000/day budget.
const WINDOW_DAYS = 3;
// Reject stale signatures so a captured request cannot be replayed later.
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

function verifySignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = process.env.WHOOP_CLIENT_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timingSafeEqual throws on length mismatch, which is itself a failed match.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  // Read the RAW body before parsing: the signature is over these exact bytes,
  // and re-serializing parsed JSON would not reproduce them.
  const rawBody = await request.text();
  const signature = request.headers.get("x-whoop-signature");
  const timestamp = request.headers.get("x-whoop-signature-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
  }
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > MAX_SIGNATURE_AGE_MS) {
    return NextResponse.json({ error: "Signature timestamp out of range" }, { status: 401 });
  }
  if (!verifySignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { user_id?: number; id?: string; type?: string; trace_id?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const whoopUserId = event.user_id;
  if (typeof whoopUserId !== "number") {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRow, error: lookupError } = await supabase
    .from("whoop_tokens")
    .select("user_id")
    .eq("whoop_user_id", whoopUserId)
    .maybeSingle();

  if (lookupError) {
    // A transient database failure is worth retrying.
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!tokenRow) {
    // Nothing to map this member to. Retrying will not change that, so ack it
    // rather than making WHOOP redeliver forever.
    console.warn(`[Whoop webhook] no app user for whoop_user_id ${whoopUserId}`);
    return NextResponse.json({ ok: true, ignored: "unknown user" });
  }

  const userId = tokenRow.user_id as string;
  const today = localDateString(new Date());
  const start = addDays(today, -(WINDOW_DAYS - 1));

  try {
    const result = await syncWhoopRange(supabase, userId, start, today);

    // Refresh the summaries for the same days. Without this the app and all
    // analysis keep reading a stale summary until the nightly cron, which
    // would look exactly like the webhook not working.
    for (const date of dateRange(start, today)) {
      try {
        await syncDailySummary(date, userId);
      } catch (err) {
        console.warn(`[Whoop webhook] summary re-sync failed for ${date}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      type: event.type,
      trace_id: event.trace_id,
      range: { start, end: today },
      days: result.days,
      withRecovery: result.withRecovery,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[Whoop webhook] sync failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
