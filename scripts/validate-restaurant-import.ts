/**
 * Offline receiver for nutrition-pipeline Health Tracker bundles.
 *
 * This command has no Supabase client and cannot write the database.
 * Usage: npm run validate-restaurant-import -- <bundle-directory>
 */

import { loadRestaurantImportBundle } from "./lib/restaurant-import-bundle";

function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Restaurant import validation failed: bundle directory argument is required");

  const bundle = loadRestaurantImportBundle(input);
  console.log(
    JSON.stringify(
      {
        status: "VALID_OFFLINE_TRANSFER",
        bundle: bundle.root,
        chains: bundle.payload.batches.map((batch) => batch.chain),
        food_rows: bundle.payload.foods.length,
        provenance_rows: bundle.payload.provenance.length,
        rpc_payload_bytes: bundle.payloadBytes,
        catalog_writes: 0,
      },
      null,
      2,
    ),
  );
}

main();
