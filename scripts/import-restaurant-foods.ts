/**
 * Dry-run-first importer for validated restaurant-food transfer bundles.
 *
 * Validation always completes before credentials are loaded. The database is
 * contacted only when the operator explicitly supplies --apply.
 */

import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnvironment } from "dotenv";
import {
  assertRestaurantImportResult,
  loadRestaurantImportBundle,
} from "./lib/restaurant-import-bundle";

interface Arguments {
  bundleDirectory: string;
  apply: boolean;
}

function parseArguments(argv: string[]): Arguments {
  const positional: string[] = [];
  let apply = false;
  for (const argument of argv) {
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: npm run import-restaurant-foods -- <bundle-directory> [--apply]\n" +
          "Without --apply the command validates and reports zero database writes.",
      );
      process.exit(0);
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  if (positional.length !== 1) {
    throw new Error("Exactly one bundle directory is required");
  }
  return { bundleDirectory: positional[0], apply };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  // No environment or network access occurs before the complete offline gate.
  const bundle = loadRestaurantImportBundle(options.bundleDirectory);
  const validated = {
    bundle: bundle.root,
    chains: bundle.payload.batches.map((batch) => batch.chain),
    batch_rows: bundle.manifest.counts.chains,
    food_rows: bundle.manifest.counts.foods,
    provenance_rows: bundle.manifest.counts.provenance,
    rpc_payload_bytes: bundle.payloadBytes,
  };

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          status: "VALID_DRY_RUN",
          ...validated,
          database_writes: 0,
          next_step: "Rerun the exact command with --apply only after the SQL migrations and backup checks pass.",
        },
        null,
        2,
      ),
    );
    return;
  }

  loadEnvironment({ path: resolve(process.cwd(), ".env.local"), quiet: true });
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required with --apply");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required with --apply");
  if (serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must not be the public anon key");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  // One RPC call is one PostgreSQL transaction: batches, versions, and
  // provenance all succeed together or all roll back together.
  const { data, error } = await supabase.rpc("import_restaurant_food_bundle", {
    bundle: bundle.payload,
  });
  if (error) throw new Error(`Restaurant import RPC failed: ${error.message}`);
  const result = assertRestaurantImportResult(data, bundle.manifest.counts);

  console.log(
    JSON.stringify(
      {
        ...result,
        bundle: bundle.root,
        chains: validated.chains,
        database_writes: result.inserted_batches + result.inserted_food_versions +
          result.reactivated_food_versions + result.deactivated_food_versions + result.inserted_provenance,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
