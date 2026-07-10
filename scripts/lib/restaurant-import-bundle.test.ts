import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canonicalJsonSha256,
  loadRestaurantImportBundle,
  RESTAURANT_IMPORT_CONTRACT,
} from "./restaurant-import-bundle";

const roots: string[] = [];

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function makeFixture(options: { auditVerdict?: string; duplicateFood?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "restaurant-import-"));
  roots.push(root);
  const chain = "Test Chain";
  const candidateHash = "a".repeat(64);
  const auditHash = "b".repeat(64);
  const batchKey = canonicalJsonSha256({
    chain,
    candidate_sha256: candidateHash,
    audit_sha256: auditHash,
  });
  const identity = `restaurant:test-chain:${"c".repeat(64)}`;
  const food = {
    added_sugar: null,
    barcode: null,
    brand: chain,
    brand_slug: "test-chain",
    calcium: null,
    calories: 180,
    cholesterol: 25,
    content_hash: "",
    embedding: null,
    fdc_id: null,
    fiber: 2,
    iron: null,
    is_active: true,
    monounsaturated_fat: null,
    name: "Test Taco",
    polyunsaturated_fat: null,
    protein: 8,
    saturated_fat: 3.5,
    search_aliases: ["test chain", "testchain"],
    serving_size: "2 oz",
    serving_size_grams: 56.699,
    sodium: 310,
    source: "restaurant_official",
    source_category: "Tacos",
    source_external_id: null,
    source_identity_key: identity,
    sugar: 0,
    total_carbohydrates: 12,
    total_fat: 9,
    trans_fat: null,
    variant_label: null,
    verified_at: "2026-07-10T00:00:00+00:00",
    vitamin_a: null,
    vitamin_c: null,
    vitamin_d: null,
  };
  food.content_hash = canonicalJsonSha256({
    source_identity_key: identity,
    serving_size: food.serving_size,
    calories: food.calories,
    protein: food.protein,
    total_fat: food.total_fat,
    saturated_fat: food.saturated_fat,
    cholesterol: food.cholesterol,
    sodium: food.sodium,
    total_carbohydrates: food.total_carbohydrates,
    fiber: food.fiber,
    sugar: food.sugar,
  });
  const foods = options.duplicateFood ? [food, food] : [food];
  const provenance = foods.map((current, index) => ({
    authorization_url: null,
    batch_key: batchKey,
    content_hash: current.content_hash,
    evidence: [{ line_numbers: [1], source_id: "source_001" }],
    nutrient_qualifiers: {},
    page_number: 1,
    pipeline_display_name: "Test Taco (2 oz)",
    pipeline_row_id: `row_${String(index + 1).padStart(5, "0")}`,
    raw_nutrients: {
      calories: "180",
      carbohydrates_g: "12",
      cholesterol_mg: "25",
      fiber_g: "2",
      protein_g: "8",
      saturated_fat_g: "3.5",
      sodium_mg: "310",
      sugars_g: "0",
      total_fat_g: "9",
    },
    source_category: "Tacos",
    source_id: "source_001",
    source_identity_key: identity,
    source_section: "main",
    source_sha256: "d".repeat(64),
    source_url: "https://example.com/nutrition.pdf",
    value_method: "deterministic_test_adapter",
  }));
  const batch = {
    approved_at: food.verified_at,
    audit_model: "test-frontier",
    audit_sha256: auditHash,
    audit_usage: {},
    audit_verdict: options.auditVerdict ?? "PASS",
    batch_key: batchKey,
    candidate_sha256: candidateHash,
    chain,
    checked_rows: foods.length,
    expected_rows: foods.length,
    pipeline_job_slug: "Test_Chain",
  };
  const createdAt = "2026-07-10T01:00:00+00:00";
  const report = {
    chain_count: 1,
    chains: [chain],
    created_at: createdAt,
    food_row_count: foods.length,
    page_variant_identity_count: 0,
    provenance_row_count: provenance.length,
    qualified_value_count: 0,
    rows_with_serving_grams: foods.length,
    rule: "This bundle is an offline transfer artifact. It does not write Supabase.",
    status: "DRY_RUN_ONLY_NOT_IMPORTED",
  };

  writeFileSync(join(root, "foods.jsonl"), `${foods.map((row) => JSON.stringify(row)).join("\n")}\n`);
  writeFileSync(join(root, "provenance.jsonl"), `${provenance.map((row) => JSON.stringify(row)).join("\n")}\n`);
  writeFileSync(join(root, "batches.json"), JSON.stringify([batch]));
  writeFileSync(join(root, "dry_run_report.json"), JSON.stringify(report));
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({
      contract: RESTAURANT_IMPORT_CONTRACT,
      counts: { chains: 1, foods: foods.length, provenance: provenance.length },
      created_at: createdAt,
      files: {
        "batches.json": sha256(join(root, "batches.json")),
        "dry_run_report.json": sha256(join(root, "dry_run_report.json")),
        "foods.jsonl": sha256(join(root, "foods.jsonl")),
        "provenance.jsonl": sha256(join(root, "provenance.jsonl")),
      },
    }),
  );
  return root;
}

test.afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("accepts a complete hash-bound PASS bundle", () => {
  const result = loadRestaurantImportBundle(makeFixture());
  assert.equal(result.payload.foods.length, 1);
  assert.equal(result.payload.provenance.length, 1);
  assert.equal(Object.keys(result.payload.provenance[0]).length, 16);
  assert.equal(result.payload.batches[0].audit_verdict, "PASS");
  assert.ok(result.payloadBytes > 0);
});

test("rejects a file changed after its hash was declared in the manifest", () => {
  const root = makeFixture();
  writeFileSync(join(root, "foods.jsonl"), `${readFileSync(join(root, "foods.jsonl"), "utf8")} `);
  assert.throws(() => loadRestaurantImportBundle(root), /foods\.jsonl hash mismatch/);
});

test("rejects a batch whose independent audit is not PASS", () => {
  assert.throws(() => loadRestaurantImportBundle(makeFixture({ auditVerdict: "FAIL" })), /audit_verdict must be PASS/);
});

test("rejects duplicate active source identities even with valid file hashes", () => {
  assert.throws(() => loadRestaurantImportBundle(makeFixture({ duplicateFood: true })), /duplicate food identity\/content version/);
});
