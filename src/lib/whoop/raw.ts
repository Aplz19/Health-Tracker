/**
 * Typed access to the WHOOP payload archived in `whoop_data.raw_data`.
 *
 * The sync has always stored the full API response, so every sub-metric WHOOP
 * returns (sleep stages, efficiency, consistency, respiratory rate, sleep-need
 * breakdown) is already on disk for every synced day -- it was simply never
 * promoted out of the JSON. The UI reached into it with ad-hoc inline casts;
 * this module is the single typed reader so the UI and the daily-summary
 * aggregation cannot drift.
 *
 * Durations are converted from WHOOP's milliseconds to minutes to match
 * `sleep_duration_minutes`, so nothing downstream has to remember which unit a
 * given field arrived in.
 */

import type { WhoopCycle, WhoopRecovery, WhoopSleep } from "./types";

export interface WhoopRawData {
  cycle?: WhoopCycle | null;
  recovery?: WhoopRecovery | null;
  sleep?: WhoopSleep | null;
}

export function readWhoopRaw(raw: unknown): WhoopRawData {
  return (raw && typeof raw === "object" ? raw : {}) as WhoopRawData;
}

function toMinutes(milli: number | null | undefined): number | null {
  return typeof milli === "number" ? Math.round(milli / 60000) : null;
}

function round(value: number | null | undefined, places = 1): number | null {
  if (typeof value !== "number") return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Everything WHOOP reports about a night beyond the headline duration/score. */
export interface WhoopSleepDetail {
  sleep_light_minutes: number | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_in_bed_minutes: number | null;
  sleep_no_data_minutes: number | null;
  sleep_cycle_count: number | null;
  sleep_disturbance_count: number | null;
  sleep_efficiency_percentage: number | null;
  sleep_consistency_percentage: number | null;
  respiratory_rate: number | null;
  sleep_needed_baseline_minutes: number | null;
  sleep_needed_from_debt_minutes: number | null;
  sleep_needed_from_strain_minutes: number | null;
  sleep_needed_from_nap_minutes: number | null;
  /** Onset/offset timestamps -- the input a meal-to-sleep analysis needs. */
  sleep_start: string | null;
  sleep_end: string | null;
  is_nap: boolean | null;
}

export const EMPTY_SLEEP_DETAIL: WhoopSleepDetail = {
  sleep_light_minutes: null,
  sleep_deep_minutes: null,
  sleep_rem_minutes: null,
  sleep_awake_minutes: null,
  sleep_in_bed_minutes: null,
  sleep_no_data_minutes: null,
  sleep_cycle_count: null,
  sleep_disturbance_count: null,
  sleep_efficiency_percentage: null,
  sleep_consistency_percentage: null,
  respiratory_rate: null,
  sleep_needed_baseline_minutes: null,
  sleep_needed_from_debt_minutes: null,
  sleep_needed_from_strain_minutes: null,
  sleep_needed_from_nap_minutes: null,
  sleep_start: null,
  sleep_end: null,
  is_nap: null,
};

export function sleepDetailFromRaw(raw: unknown): WhoopSleepDetail {
  const sleep = readWhoopRaw(raw).sleep;
  if (!sleep) return EMPTY_SLEEP_DETAIL;

  const score = sleep.score;
  const stages = score?.stage_summary;
  const needed = score?.sleep_needed;

  return {
    sleep_light_minutes: toMinutes(stages?.total_light_sleep_time_milli),
    sleep_deep_minutes: toMinutes(stages?.total_slow_wave_sleep_time_milli),
    sleep_rem_minutes: toMinutes(stages?.total_rem_sleep_time_milli),
    sleep_awake_minutes: toMinutes(stages?.total_awake_time_milli),
    sleep_in_bed_minutes: toMinutes(stages?.total_in_bed_time_milli),
    sleep_no_data_minutes: toMinutes(stages?.total_no_data_time_milli),
    sleep_cycle_count: stages?.sleep_cycle_count ?? null,
    sleep_disturbance_count: stages?.disturbance_count ?? null,
    sleep_efficiency_percentage: round(score?.sleep_efficiency_percentage),
    sleep_consistency_percentage: round(score?.sleep_consistency_percentage),
    respiratory_rate: round(score?.respiratory_rate, 2),
    sleep_needed_baseline_minutes: toMinutes(needed?.baseline_milli),
    sleep_needed_from_debt_minutes: toMinutes(needed?.need_from_sleep_debt_milli),
    sleep_needed_from_strain_minutes: toMinutes(needed?.need_from_recent_strain_milli),
    sleep_needed_from_nap_minutes: toMinutes(needed?.need_from_recent_nap_milli),
    sleep_start: sleep.start ?? null,
    sleep_end: sleep.end ?? null,
    is_nap: typeof sleep.nap === "boolean" ? sleep.nap : null,
  };
}

/** WHOOP marks a recovery as calibrating while it still lacks a baseline. */
export function userCalibratingFromRaw(raw: unknown): boolean | null {
  const c = readWhoopRaw(raw).recovery?.score?.user_calibrating;
  return typeof c === "boolean" ? c : null;
}
