/**
 * Pull body weight from WHOOP into `body_measurements`.
 *
 * WHOOP's Apple Health integration is bidirectional: it IMPORTS body
 * measurements to improve calorie accuracy. So a smart-scale reading that syncs
 * to Apple Health reaches WHOOP, and this endpoint gives it back to us -- no
 * extra third-party app in the chain.
 *
 * Two limits worth remembering:
 *  * `/v2/user/measurement/body` is a CURRENT SNAPSHOT with no timestamp and no
 *    history, so we stamp it ourselves and sample daily. Weight only resolves
 *    questions on a weekly timescale, so daily resolution loses nothing.
 *  * WHOOP exposes NO body-fat or lean-mass field. That data exists on the
 *    scale and in Apple Health but WHOOP discards it, so composition still
 *    needs the Apple Health route.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBodyMeasurement, getValidAccessToken } from "./client";
import { isMissingSchemaError } from "@/lib/habits/logic";
import { localDateString } from "@/lib/daily-summary/date";

const KG_TO_LB = 2.20462262;

export type BodySyncOutcome =
  | { status: "stored"; weightLb: number; measuredAt: string }
  | { status: "skipped"; reason: string };

export async function syncBodyMeasurement(
  supabase: SupabaseClient,
  userId: string
): Promise<BodySyncOutcome> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return { status: "skipped", reason: "no valid access token" };

  let weightKg: number;
  try {
    const body = await fetchBodyMeasurement(accessToken);
    weightKg = body.weight_kilogram;
  } catch (err) {
    // A token issued before read:body_measurement was requested returns 401
    // here while every other call still succeeds. Reconnecting WHOOP fixes it,
    // and it must not fail the rest of the sync.
    return {
      status: "skipped",
      reason: `body measurement unavailable (reconnect WHOOP to grant read:body_measurement): ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }

  if (typeof weightKg !== "number" || weightKg <= 0) {
    return { status: "skipped", reason: "no weight reported" };
  }

  const weightLb = Math.round(weightKg * KG_TO_LB * 10) / 10;

  // The snapshot carries no measurement time, so anchor it to the local day.
  // That makes the unique constraint collapse repeated runs into one row per
  // day instead of accumulating a row per sync.
  const measuredAt = `${localDateString(new Date())}T00:00:00Z`;

  const { error } = await supabase.from("body_measurements").upsert(
    {
      user_id: userId,
      metric: "weight",
      value: weightLb,
      unit: "lb",
      measured_at: measuredAt,
      source: "whoop",
    },
    { onConflict: "user_id,metric,measured_at,source" }
  );

  if (error) {
    if (isMissingSchemaError(error)) {
      return { status: "skipped", reason: "sql/add_body_measurements.sql not applied yet" };
    }
    throw new Error(`body_measurements upsert failed: ${error.message}`);
  }

  return { status: "stored", weightLb, measuredAt };
}
