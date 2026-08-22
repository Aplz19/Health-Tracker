/**
 * Re-pull Whoop recovery/sleep history that the nightly cron lost.
 *
 * The cron wrote `recovery_score: ... ?? null` and upserted the whole row, so a
 * sync that ran before Whoop had scored a recovery erased it -- see
 * src/lib/whoop/sync.ts. The data still exists in Whoop's cloud; this pulls it
 * back and merges it in, never overwriting a value already stored.
 *
 * Prerequisites: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env.local.
 *
 * Run: npm run backfill-whoop -- --from 2026-06-01 [--to 2026-08-22]
 *                              [--user <uuid>] [--chunk 14]
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { syncWhoopRange } from "../src/lib/whoop/sync";
import { addDays, localDateString } from "../src/lib/daily-summary/date";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!process.env.WHOOP_CLIENT_ID || !process.env.WHOOP_CLIENT_SECRET) {
  console.error("Missing WHOOP_CLIENT_ID or WHOOP_CLIENT_SECRET (needed to refresh the token)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const from = arg("from");
const to = arg("to") ?? localDateString(new Date());
const only = arg("user");
// Whoop paginates 25 records a page; small chunks keep each request cheap and
// make partial progress durable if a run is interrupted.
const chunkDays = Number(arg("chunk") ?? 14);

if (!from) {
  console.error("--from YYYY-MM-DD is required");
  process.exit(1);
}

async function main() {
  let userIds: string[];
  if (only) {
    userIds = [only];
  } else {
    const { data, error } = await supabase.from("whoop_tokens").select("user_id");
    if (error) throw error;
    userIds = (data ?? []).map((t) => t.user_id);
  }
  console.log(`Users with Whoop connected: ${userIds.length}`);
  console.log(`Range: ${from} .. ${to}  (chunks of ${chunkDays} days)\n`);

  for (const userId of userIds) {
    console.log(userId);
    let days = 0;
    let rec = 0;
    let slp = 0;
    let preserved = 0;

    for (let start = from!; start <= to; start = addDays(start, chunkDays)) {
      const end = addDays(start, chunkDays - 1) > to ? to : addDays(start, chunkDays - 1);
      try {
        const r = await syncWhoopRange(supabase, userId, start, end);
        days += r.days;
        rec += r.withRecovery;
        slp += r.withSleep;
        preserved += r.preserved;
        console.log(
          `  ${start}..${end}  cycles=${r.days}  recovery=${r.withRecovery}  sleep=${r.withSleep}`
        );
      } catch (err) {
        console.log(`  ${start}..${end}  FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`  TOTAL days=${days} recovery=${rec} sleep=${slp} preserved=${preserved}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
