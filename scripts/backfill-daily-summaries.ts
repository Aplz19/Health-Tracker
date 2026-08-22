/**
 * Rebuild daily_summaries from the source tables.
 *
 * The nightly cron summarized the UTC date rather than the local one, so it
 * aggregated each day as it *began* and wrote zeros over it (see
 * src/lib/daily-summary/date.ts). daily_summaries is derived, so every affected
 * day can be recomputed exactly from the source tables.
 *
 * Only days that actually have source rows are summarized. Writing a summary
 * for a day with no data would assert "0 calories" where the truth is "nothing
 * logged" -- the sparse-truth rule the habits and nutrition work already follow.
 *
 * Prerequisites: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * .env.local.
 *
 * Run: npm run backfill-summaries -- [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *                                   [--user <uuid>] [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { syncDailySummary } from "../src/lib/daily-summary/aggregate";
import { previousLocalDate } from "../src/lib/daily-summary/date";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL");
  console.error("- SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Every table the aggregation reads that is keyed by (user_id, date).
const SOURCE_TABLES = [
  "meals",
  "food_logs",
  "tracked_item_logs",
  "exercise_logs",
  "treadmill_sessions",
  "whoop_data",
  "habit_logs",
  "daily_notes",
] as const;

const PAGE = 1000;
const CONCURRENCY = 4;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const dryRun = process.argv.includes("--dry-run");
const fromArg = arg("from");
const toArg = arg("to") ?? previousLocalDate();
const userArg = arg("user");

/** Every date on which a user has at least one source row. */
async function datesWithData(userId: string): Promise<Set<string>> {
  const dates = new Set<string>();
  for (const table of SOURCE_TABLES) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select("date")
        .eq("user_id", userId)
        .range(offset, offset + PAGE - 1);
      if (error) {
        // A table missing in this deployment is not fatal; note and move on.
        console.warn(`  ! ${table}: ${error.message}`);
        break;
      }
      for (const row of data ?? []) if (row.date) dates.add(String(row.date).slice(0, 10));
      if (!data || data.length < PAGE) break;
    }
  }
  return dates;
}

async function listUserIds(): Promise<string[]> {
  if (userArg) return [userArg];
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < 200) break;
  }
  return ids;
}

/** Run `task` over `items` with bounded concurrency, preserving no order. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await task(items[cursor++]);
    })
  );
}

async function main() {
  const userIds = await listUserIds();
  console.log(`Users: ${userIds.length}${dryRun ? "  (DRY RUN -- no writes)" : ""}`);

  let totalOk = 0;
  let totalFail = 0;

  for (const userId of userIds) {
    const all = await datesWithData(userId);
    const dates = [...all]
      .filter((d) => (!fromArg || d >= fromArg) && d <= toArg)
      .sort();

    console.log(`\n${userId}`);
    if (dates.length === 0) {
      console.log("  no source data in range -- nothing to rebuild");
      continue;
    }
    console.log(`  ${dates.length} days with data: ${dates[0]} .. ${dates[dates.length - 1]}`);
    if (dryRun) continue;

    let ok = 0;
    const failures: string[] = [];
    await pool(dates, CONCURRENCY, async (date) => {
      try {
        await syncDailySummary(date, userId);
        ok++;
        if (ok % 25 === 0) process.stdout.write(`  ...${ok}/${dates.length}\n`);
      } catch (err) {
        failures.push(`${date}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    });

    totalOk += ok;
    totalFail += failures.length;
    console.log(`  rebuilt ${ok}/${dates.length}`);
    for (const f of failures.slice(0, 10)) console.log(`  FAILED ${f}`);
    if (failures.length > 10) console.log(`  ...and ${failures.length - 10} more failures`);
  }

  console.log(`\nDone. rebuilt=${totalOk} failed=${totalFail}`);
  if (totalFail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
