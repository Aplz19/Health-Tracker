/**
 * Populate `whoop_tokens.whoop_user_id` for already-connected accounts.
 *
 * Webhooks identify the member ONLY by WHOOP's numeric user id, so without
 * this column an inbound event cannot be mapped to an app user. The OAuth
 * callback now stores it on connect; existing rows predate that and are null.
 *
 * Run: npm run backfill-whoop-user-ids
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fetchProfile, getValidAccessToken } from "../src/lib/whoop/client";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await supabase.from("whoop_tokens").select("user_id, whoop_user_id");
  if (error) throw error;

  const rows = data ?? [];
  console.log(`whoop_tokens rows: ${rows.length}`);

  for (const row of rows) {
    const userId = row.user_id as string;
    if (row.whoop_user_id) {
      console.log(`  ${userId}  already set (${row.whoop_user_id})`);
      continue;
    }
    const token = await getValidAccessToken(userId);
    if (!token) {
      console.log(`  ${userId}  SKIPPED: no valid access token`);
      continue;
    }
    try {
      const profile = await fetchProfile(token);
      const { error: updateError } = await supabase
        .from("whoop_tokens")
        .update({ whoop_user_id: profile.user_id })
        .eq("user_id", userId);
      if (updateError) throw updateError;
      console.log(`  ${userId}  -> whoop_user_id ${profile.user_id}`);
    } catch (err) {
      console.log(`  ${userId}  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
