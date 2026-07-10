/**
 * Dry-run-first importer for validated restaurant-food transfer bundles.
 *
 * Validation always completes before credentials are loaded. The database is
 * contacted only when the operator explicitly supplies an apply mode.
 */

import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnvironment } from "dotenv";
import {
  assertRestaurantImportResult,
  loadRestaurantImportBundle,
} from "./lib/restaurant-import-bundle";
import {
  hashRestaurantImportBody,
  MAX_RESTAURANT_IMPORT_BYTES,
} from "../src/lib/restaurant-import/request";

interface Arguments {
  bundleDirectory: string;
  apply: boolean;
  applyViaVercel: boolean;
}

function parseArguments(argv: string[]): Arguments {
  const positional: string[] = [];
  let apply = false;
  let applyViaVercel = false;
  for (const argument of argv) {
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--apply-via-vercel") {
      applyViaVercel = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: npm run import-restaurant-foods -- <bundle-directory> " +
          "[--apply-via-vercel | --apply]\n" +
          "Without an apply flag the command validates and reports zero database writes.\n" +
          "Production should use --apply-via-vercel so the service-role key stays in Vercel.",
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
  if (apply && applyViaVercel) {
    throw new Error("Choose either --apply-via-vercel or --apply, not both");
  }
  return { bundleDirectory: positional[0], apply, applyViaVercel };
}

function requireVercelImportUrl(value: string | undefined): string {
  if (!value) throw new Error("RESTAURANT_IMPORT_URL is required with --apply-via-vercel");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RESTAURANT_IMPORT_URL must be a valid absolute URL");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("RESTAURANT_IMPORT_URL must use HTTPS outside local development");
  }
  if (url.pathname !== "/api/admin/restaurant-import" || url.search || url.hash) {
    throw new Error("RESTAURANT_IMPORT_URL must point exactly to /api/admin/restaurant-import");
  }
  return url.toString();
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
    rpc_payload_sha256: hashRestaurantImportBody(JSON.stringify(bundle.payload)),
  };

  if (!options.apply && !options.applyViaVercel) {
    console.log(
      JSON.stringify(
        {
          status: "VALID_DRY_RUN",
          ...validated,
          catalog_writes: 0,
          next_step: "Rerun with --apply-via-vercel only after the SQL migrations and backup checks pass.",
        },
        null,
        2,
      ),
    );
    return;
  }

  loadEnvironment({ path: resolve(process.cwd(), ".env.local"), quiet: true });
  if (options.applyViaVercel) {
    const importUrl = requireVercelImportUrl(process.env.RESTAURANT_IMPORT_URL);
    const importSecret = process.env.RESTAURANT_IMPORT_SECRET;
    if (!importSecret) {
      throw new Error("RESTAURANT_IMPORT_SECRET is required with --apply-via-vercel");
    }

    const body = JSON.stringify(bundle.payload);
    const bodyBytes = Buffer.byteLength(body, "utf8");
    if (bodyBytes > MAX_RESTAURANT_IMPORT_BYTES) {
      throw new Error(
        `Vercel import payload is ${bodyBytes} bytes; split it below the ${MAX_RESTAURANT_IMPORT_BYTES}-byte bridge limit`,
      );
    }

    const response = await fetch(importUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${importSecret}`,
        "Content-Length": String(bodyBytes),
        "Content-Type": "application/json",
      },
      body,
    });
    const responseBody = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const publicError = responseBody && typeof responseBody === "object" &&
        typeof (responseBody as Record<string, unknown>).error === "string"
        ? (responseBody as Record<string, string>).error
        : `HTTP ${response.status}`;
      throw new Error(`Restaurant import bridge failed: ${publicError}`);
    }
    const result = assertRestaurantImportResult(responseBody, bundle.manifest.counts);
    console.log(
      JSON.stringify(
        {
          ...result,
          bundle: bundle.root,
          chains: validated.chains,
          catalog_writes: result.inserted_batches + result.inserted_food_versions +
            result.reactivated_food_versions + result.deactivated_food_versions + result.inserted_provenance,
        },
        null,
        2,
      ),
    );
    return;
  }

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
        catalog_writes: result.inserted_batches + result.inserted_food_versions +
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
