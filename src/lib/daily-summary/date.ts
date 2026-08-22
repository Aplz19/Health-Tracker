/**
 * Which calendar day a nightly summary run should aggregate.
 *
 * The Vercel cron fires on a UTC schedule, but a "day" of health data is a day
 * in the user's local timezone. The original implementation summarized
 * `format(new Date(), "yyyy-MM-dd")`, which is the *UTC* date -- and by the
 * time the job ran that date had already rolled over. So every night it
 * aggregated the day that was just beginning, found nothing, and wrote a
 * summary of zeros over the row for that day.
 *
 * Resolve the local calendar date explicitly instead. No new dependency:
 * Intl handles the timezone, and the day arithmetic is pure calendar math on
 * the YYYY-MM-DD string, so DST transitions cannot shift it.
 */

export const SUMMARY_TIME_ZONE = "America/Chicago";

/** Calendar date (YYYY-MM-DD) in `timeZone` at instant `at`. */
export function localDateString(at: Date, timeZone: string = SUMMARY_TIME_ZONE): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Shift a YYYY-MM-DD string by whole days. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The day that just ended in `timeZone` -- what a nightly run should summarize.
 * Runs after local midnight, so "yesterday" is the last complete day.
 */
export function previousLocalDate(
  at: Date = new Date(),
  timeZone: string = SUMMARY_TIME_ZONE
): string {
  return addDays(localDateString(at, timeZone), -1);
}

/** Inclusive YYYY-MM-DD list from `from` to `to`. Empty when `from` > `to`. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
    // Guard against a malformed bound spinning forever.
    if (dates.length > 10000) throw new Error(`dateRange ${from}..${to} too large`);
  }
  return dates;
}
