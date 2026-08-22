/**
 * Shared Whoop -> whoop_data sync.
 *
 * Used by both the nightly cron and scripts/backfill-whoop.ts so the two can
 * never drift apart.
 *
 * Two bugs this exists to fix:
 *
 * 1. NULL CLOBBERING. The previous implementation built each row as
 *    `recovery?.score?.recovery_score ?? null` and upserted the whole row.
 *    Whoop scores a recovery *after* the cycle exists, so a sync that ran
 *    before scoring wrote null -- and every later re-sync wrote null again,
 *    because a cycle can come back from the API without its recovery when the
 *    two endpoints disagree at the window edge. Existing good values were
 *    overwritten. Fields are now merged: a value already in the database is
 *    never replaced by null.
 *
 * 2. TOO NARROW A WINDOW. Syncing only the last 2 days meant a recovery scored
 *    late had a very small chance of ever being picked up.
 *
 * Evidence: the 365 rows bulk-imported on 2026-01-18 are 99% complete for
 * recovery, while the 216 rows written by the daily cron are 73% -- and far
 * worse in recent months.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCycles, fetchRecoveries, fetchSleep, getValidAccessToken } from "./client";
import type { WhoopRecovery, WhoopSleep } from "./types";

/** Late-scored recoveries need a wide enough window to ever be collected. */
export const DEFAULT_SYNC_LOOKBACK_DAYS = 7;

function msToMinutes(ms: number): number {
  return Math.round(ms / 60000);
}

/**
 * Date a cycle belongs to. Cycles start on waking, so the UTC date matches the
 * local date for US mornings -- and critically this matches how the original
 * import dated its 365 rows. Changing it would misalign existing history.
 */
function getDateFromTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

/** Keep an existing value rather than overwriting it with null. */
function coalesce<T>(next: T | null | undefined, prev: T | null | undefined): T | null {
  return next ?? prev ?? null;
}

export interface WhoopSyncResult {
  days: number;
  withRecovery: number;
  withSleep: number;
  /** Fields kept from the database because this fetch returned nothing. */
  preserved: number;
}

export async function syncWhoopRange(
  supabase: SupabaseClient,
  userId: string,
  startStr: string,
  endStr: string
): Promise<WhoopSyncResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) throw new Error("No valid access token");

  const [cycles, recoveries, sleeps] = await Promise.all([
    fetchCycles(accessToken, startStr, endStr),
    fetchRecoveries(accessToken, startStr, endStr),
    fetchSleep(accessToken, startStr, endStr),
  ]);

  if (cycles.length === 0) {
    return { days: 0, withRecovery: 0, withSleep: 0, preserved: 0 };
  }

  const recoveryByCycle = new Map<number, WhoopRecovery>();
  for (const recovery of recoveries) recoveryByCycle.set(recovery.cycle_id, recovery);

  const sleepByCycle = new Map<number, WhoopSleep>();
  const sleepById = new Map<string, WhoopSleep>();
  for (const sleep of sleeps) {
    if (sleep.cycle_id) sleepByCycle.set(sleep.cycle_id, sleep);
    if (sleep.id) sleepById.set(String(sleep.id), sleep);
  }

  // Read what is already stored so a fetch that returns nothing cannot erase it.
  const dates = [...new Set(cycles.filter((c) => c.start).map((c) => getDateFromTimestamp(c.start)))];
  const existingByDate = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < dates.length; i += 200) {
    const { data } = await supabase
      .from("whoop_data")
      .select("*")
      .eq("user_id", userId)
      .in("date", dates.slice(i, i + 200));
    for (const row of data ?? []) existingByDate.set(String(row.date), row);
  }

  let withRecovery = 0;
  let withSleep = 0;
  let preserved = 0;
  const rows = [];

  for (const cycle of cycles) {
    if (!cycle.start) continue;
    const date = getDateFromTimestamp(cycle.start);
    const existing = existingByDate.get(date) ?? {};
    const recovery = recoveryByCycle.get(cycle.id);

    // Recovery names the sleep it was computed from, which is more reliable
    // than cycle_id on the sleep record itself.
    const sleep =
      sleepByCycle.get(cycle.id) ??
      (recovery?.sleep_id ? sleepById.get(String(recovery.sleep_id)) : undefined);

    let sleepDurationMinutes: number | null = null;
    let sleepScore: number | null = null;
    if (sleep?.score) {
      const stages = sleep.score.stage_summary;
      sleepDurationMinutes = msToMinutes(
        (stages?.total_light_sleep_time_milli || 0) +
          (stages?.total_slow_wave_sleep_time_milli || 0) +
          (stages?.total_rem_sleep_time_milli || 0)
      );
      sleepScore = Math.round(sleep.score.sleep_performance_percentage || 0);
    }

    const merged = {
      user_id: userId,
      date,
      cycle_id: cycle.id,
      recovery_score: coalesce(recovery?.score?.recovery_score, existing.recovery_score),
      hrv_rmssd: coalesce(recovery?.score?.hrv_rmssd_milli, existing.hrv_rmssd),
      resting_heart_rate: coalesce(recovery?.score?.resting_heart_rate, existing.resting_heart_rate),
      spo2_percentage: coalesce(recovery?.score?.spo2_percentage, existing.spo2_percentage),
      skin_temp_celsius: coalesce(recovery?.score?.skin_temp_celsius, existing.skin_temp_celsius),
      sleep_id: coalesce(sleep?.id, existing.sleep_id),
      sleep_score: coalesce(sleepScore, existing.sleep_score),
      sleep_duration_minutes: coalesce(sleepDurationMinutes, existing.sleep_duration_minutes),
      strain_score: coalesce(cycle.score?.strain, existing.strain_score),
      kilojoules: coalesce(cycle.score?.kilojoule, existing.kilojoules),
      avg_heart_rate: coalesce(cycle.score?.average_heart_rate, existing.avg_heart_rate),
      max_heart_rate: coalesce(cycle.score?.max_heart_rate, existing.max_heart_rate),
      raw_data: {
        cycle,
        recovery: recovery ?? (existing.raw_data as { recovery?: unknown })?.recovery ?? null,
        sleep: sleep ?? (existing.raw_data as { sleep?: unknown })?.sleep ?? null,
      },
      updated_at: new Date().toISOString(),
    };

    if (merged.recovery_score !== null) withRecovery++;
    if (merged.sleep_score !== null) withSleep++;
    if (!recovery && existing.recovery_score != null) preserved++;

    rows.push(merged);
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from("whoop_data")
      .upsert(rows.slice(i, i + 200), { onConflict: "user_id,date" });
    if (error) throw new Error(`Database error: ${error.message}`);
  }

  return { days: rows.length, withRecovery, withSleep, preserved };
}
