/**
 * Offline receiver for nutrition-pipeline Health Tracker bundles.
 *
 * This script deliberately has no Supabase client and cannot write the database.
 * Usage: npm run validate-restaurant-import -- <bundle-directory>
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface TransferManifest {
  contract: string;
  files: Record<string, string>;
  counts: { chains: number; foods: number; provenance: number };
}

interface TransferFood {
  name: string;
  brand: string;
  brand_slug: string;
  serving_size: string;
  serving_size_grams: number | null;
  calories: number;
  protein: number;
  total_fat: number;
  saturated_fat: number;
  cholesterol: number;
  sodium: number;
  total_carbohydrates: number;
  fiber: number;
  sugar: number;
  source: string;
  source_identity_key: string;
  content_hash: string;
  is_active: boolean;
}

interface TransferProvenance {
  batch_key: string;
  source_identity_key: string;
  content_hash: string;
  pipeline_row_id: string;
  source_url: string;
  evidence: unknown[];
  raw_nutrients: Record<string, unknown>;
  nutrient_qualifiers: Record<string, unknown>;
}

interface TransferBatch {
  batch_key: string;
  chain: string;
  audit_verdict: string;
  expected_rows: number;
  checked_rows: number;
}

function fail(message: string): never {
  throw new Error(`Restaurant import validation failed: ${message}`);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return fail(`${path} line ${index + 1} is not JSON`);
      }
    });
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is empty`);
}

function requireNutrient(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite non-negative number`);
  }
}

function main() {
  const input = process.argv[2];
  if (!input) fail("bundle directory argument is required");
  const root = resolve(input);
  const manifest = readJson<TransferManifest>(resolve(root, "manifest.json"));
  if (manifest.contract !== "health-tracker-restaurant-foods-v1") {
    fail(`unsupported contract ${manifest.contract}`);
  }

  for (const [filename, expectedHash] of Object.entries(manifest.files)) {
    const actualHash = sha256(resolve(root, filename));
    if (actualHash !== expectedHash) fail(`${filename} hash mismatch`);
  }

  const foods = readJsonl<TransferFood>(resolve(root, "foods.jsonl"));
  const provenance = readJsonl<TransferProvenance>(resolve(root, "provenance.jsonl"));
  const batches = readJson<TransferBatch[]>(resolve(root, "batches.json"));
  const report = readJson<{ status: string }>(resolve(root, "dry_run_report.json"));

  if (report.status !== "DRY_RUN_ONLY_NOT_IMPORTED") fail("bundle is not marked dry-run");
  if (foods.length !== manifest.counts.foods) fail("food count differs from manifest");
  if (provenance.length !== manifest.counts.provenance) {
    fail("provenance count differs from manifest");
  }
  if (batches.length !== manifest.counts.chains) fail("batch count differs from manifest");
  if (foods.length !== provenance.length) fail("every food must have one transfer provenance row");

  const nutrientFields: Array<keyof TransferFood> = [
    "calories",
    "protein",
    "total_fat",
    "saturated_fat",
    "cholesterol",
    "sodium",
    "total_carbohydrates",
    "fiber",
    "sugar",
  ];
  const foodVersions = new Map<string, TransferFood>();
  const activeIdentities = new Set<string>();
  for (const [index, food] of foods.entries()) {
    const label = `foods row ${index + 1}`;
    requireText(food.name, `${label}.name`);
    requireText(food.brand, `${label}.brand`);
    requireText(food.brand_slug, `${label}.brand_slug`);
    requireText(food.serving_size, `${label}.serving_size`);
    requireText(food.source_identity_key, `${label}.source_identity_key`);
    requireText(food.content_hash, `${label}.content_hash`);
    if (food.source !== "restaurant_official") fail(`${label}.source is not restaurant_official`);
    if (!food.is_active) fail(`${label} is unexpectedly inactive`);
    if (food.serving_size_grams !== null) {
      requireNutrient(food.serving_size_grams, `${label}.serving_size_grams`);
    }
    for (const field of nutrientFields) requireNutrient(food[field], `${label}.${field}`);
    const versionKey = `${food.source_identity_key}\u0000${food.content_hash}`;
    if (foodVersions.has(versionKey)) fail(`${label} duplicates a source/content version`);
    if (activeIdentities.has(food.source_identity_key)) {
      fail(`${label} duplicates an active source identity`);
    }
    activeIdentities.add(food.source_identity_key);
    foodVersions.set(versionKey, food);
  }

  const batchByKey = new Map(batches.map((batch) => [batch.batch_key, batch]));
  const rowsByBatch = new Map<string, number>();
  for (const [index, source] of provenance.entries()) {
    const label = `provenance row ${index + 1}`;
    requireText(source.batch_key, `${label}.batch_key`);
    requireText(source.pipeline_row_id, `${label}.pipeline_row_id`);
    requireText(source.source_url, `${label}.source_url`);
    if (!batchByKey.has(source.batch_key)) fail(`${label} references an unknown batch`);
    const versionKey = `${source.source_identity_key}\u0000${source.content_hash}`;
    if (!foodVersions.has(versionKey)) fail(`${label} has no matching food version`);
    if (!Array.isArray(source.evidence) || source.evidence.length === 0) {
      fail(`${label} has no source evidence`);
    }
    rowsByBatch.set(source.batch_key, (rowsByBatch.get(source.batch_key) || 0) + 1);
  }

  for (const batch of batches) {
    if (batch.audit_verdict !== "PASS") fail(`${batch.chain} audit is not PASS`);
    if (batch.checked_rows !== batch.expected_rows) fail(`${batch.chain} coverage is incomplete`);
    if ((rowsByBatch.get(batch.batch_key) || 0) !== batch.expected_rows) {
      fail(`${batch.chain} transferred row count differs from its audit`);
    }
  }

  console.log(JSON.stringify({
    status: "VALID_OFFLINE_TRANSFER",
    bundle: root,
    chains: batches.map((batch) => batch.chain),
    food_rows: foods.length,
    provenance_rows: provenance.length,
    database_writes: 0,
  }, null, 2));
}

main();
