import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RESTAURANT_IMPORT_CONTRACT } from "../../src/lib/restaurant-import/contract";

export { RESTAURANT_IMPORT_CONTRACT };

const REQUIRED_FILES = [
  "batches.json",
  "dry_run_report.json",
  "foods.jsonl",
  "provenance.jsonl",
] as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_CHAINS = 64;
const MAX_ROWS = 20_000;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_NUTRIENT = 10_000_000;

const FOOD_KEYS = [
  "added_sugar",
  "barcode",
  "brand",
  "brand_slug",
  "calcium",
  "calories",
  "cholesterol",
  "content_hash",
  "embedding",
  "fdc_id",
  "fiber",
  "iron",
  "is_active",
  "monounsaturated_fat",
  "name",
  "polyunsaturated_fat",
  "protein",
  "saturated_fat",
  "search_aliases",
  "serving_size",
  "serving_size_grams",
  "sodium",
  "source",
  "source_category",
  "source_external_id",
  "source_identity_key",
  "sugar",
  "total_carbohydrates",
  "total_fat",
  "trans_fat",
  "variant_label",
  "verified_at",
  "vitamin_a",
  "vitamin_c",
  "vitamin_d",
] as const;

const NUTRIENT_KEYS = [
  "calories",
  "protein",
  "total_fat",
  "saturated_fat",
  "cholesterol",
  "sodium",
  "total_carbohydrates",
  "fiber",
  "sugar",
] as const;

const NULLABLE_NUTRIENT_KEYS = [
  "trans_fat",
  "polyunsaturated_fat",
  "monounsaturated_fat",
  "added_sugar",
  "vitamin_a",
  "vitamin_c",
  "vitamin_d",
  "calcium",
  "iron",
] as const;

const RAW_NUTRIENT_KEYS = [
  "calories",
  "protein_g",
  "total_fat_g",
  "saturated_fat_g",
  "cholesterol_mg",
  "sodium_mg",
  "carbohydrates_g",
  "fiber_g",
  "sugars_g",
] as const;

export interface TransferManifest {
  contract: typeof RESTAURANT_IMPORT_CONTRACT;
  created_at: string;
  files: Record<(typeof REQUIRED_FILES)[number], string>;
  counts: { chains: number; foods: number; provenance: number };
}

export interface TransferBatch {
  batch_key: string;
  chain: string;
  pipeline_job_slug: string;
  candidate_sha256: string;
  audit_sha256: string;
  audit_model: string;
  audit_verdict: "PASS";
  expected_rows: number;
  checked_rows: number;
  approved_at: string;
  audit_usage: Record<string, unknown>;
}

export interface TransferFood {
  name: string;
  brand: string;
  brand_slug: string;
  search_aliases: string[];
  source_category: string | null;
  variant_label: string | null;
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
  trans_fat: number | null;
  polyunsaturated_fat: number | null;
  monounsaturated_fat: number | null;
  added_sugar: number | null;
  vitamin_a: number | null;
  vitamin_c: number | null;
  vitamin_d: number | null;
  calcium: number | null;
  iron: number | null;
  fdc_id: null;
  barcode: null;
  source: "restaurant_official";
  source_external_id: string | null;
  source_identity_key: string;
  content_hash: string;
  is_active: true;
  verified_at: string;
  embedding: null;
}

export interface TransferProvenance {
  batch_key: string;
  source_identity_key: string;
  content_hash: string;
  pipeline_row_id: string;
  pipeline_display_name: string;
  source_url: string;
  authorization_url: string | null;
  source_id: string;
  source_sha256: string | null;
  page_number: number | null;
  source_section: string | null;
  source_category: string | null;
  value_method: string;
  evidence: Array<Record<string, unknown>>;
  raw_nutrients: Record<string, unknown>;
  nutrient_qualifiers: Record<string, unknown>;
}

interface DryRunReport {
  status: "DRY_RUN_ONLY_NOT_IMPORTED";
  created_at: string;
  chains: string[];
  chain_count: number;
  food_row_count: number;
  provenance_row_count: number;
  qualified_value_count: number;
  page_variant_identity_count: number;
  rows_with_serving_grams: number;
  rule: string;
}

export interface RestaurantImportPayload {
  contract: typeof RESTAURANT_IMPORT_CONTRACT;
  counts: TransferManifest["counts"];
  batches: TransferBatch[];
  foods: TransferFood[];
  provenance: TransferProvenance[];
}

export interface ValidatedRestaurantImport {
  root: string;
  manifest: TransferManifest;
  report: DryRunReport;
  payload: RestaurantImportPayload;
  payloadBytes: number;
}

export interface RestaurantImportResult {
  status: "IMPORTED" | "IDEMPOTENT_REPLAY";
  contract: typeof RESTAURANT_IMPORT_CONTRACT;
  batch_rows: number;
  food_rows: number;
  provenance_rows: number;
  inserted_batches: number;
  inserted_food_versions: number;
  reactivated_food_versions: number;
  deactivated_food_versions: number;
  inserted_provenance: number;
}

function fail(message: string): never {
  throw new Error(`Restaurant import validation failed: ${message}`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const expectedSet = new Set(expected);
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !(key in value));
  const unknown = actual.filter((key) => !expectedSet.has(key));
  if (missing.length || unknown.length) {
    fail(
      `${label} keys differ from contract` +
        `${missing.length ? `; missing=${missing.join(",")}` : ""}` +
        `${unknown.length ? `; unknown=${unknown.join(",")}` : ""}`,
    );
  }
}

function requireText(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    fail(`${label} must be non-empty text no longer than ${maximum} characters`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maximum = 500): string | null {
  if (value === null) return null;
  return requireText(value, label, maximum);
}

function optionalExternalId(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 300) {
    fail(`${label} must be null or text no longer than 300 characters`);
  }
  return value;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(`${label} must be an integer greater than or equal to ${minimum}`);
  }
  return value as number;
}

function requireNumber(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_NUTRIENT
  ) {
    fail(`${label} must be a finite number between 0 and ${MAX_NUTRIENT}`);
  }
  return value;
}

function optionalNumber(value: unknown, label: string): number | null {
  return value === null ? null : requireNumber(value, label);
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const text = requireText(value, label, 64);
  if (!Number.isFinite(Date.parse(text))) fail(`${label} must be an ISO timestamp`);
  return text;
}

function requireHttpsUrl(value: unknown, label: string): string {
  const text = requireText(value, label, 2_048);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail(`${label} is not a valid URL`);
  }
  if (url.protocol !== "https:") fail(`${label} must use HTTPS`);
  return text;
}

function brandSlug(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail("cannot hash an undefined value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256Bytes(canonicalJson(value));
}

function parseJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function parseJsonl(path: string, label: string): unknown[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return fail(`${label} line ${index + 1} is not valid JSON`);
      }
    });
}

function validateManifest(value: unknown): TransferManifest {
  const manifest = asRecord(value, "manifest.json");
  assertExactKeys(manifest, ["contract", "counts", "created_at", "files"], "manifest.json");
  if (manifest.contract !== RESTAURANT_IMPORT_CONTRACT) {
    fail(`unsupported contract ${String(manifest.contract)}`);
  }
  requireTimestamp(manifest.created_at, "manifest.created_at");

  const files = asRecord(manifest.files, "manifest.files");
  assertExactKeys(files, REQUIRED_FILES, "manifest.files");
  for (const filename of REQUIRED_FILES) requireSha256(files[filename], `manifest.files.${filename}`);

  const counts = asRecord(manifest.counts, "manifest.counts");
  assertExactKeys(counts, ["chains", "foods", "provenance"], "manifest.counts");
  const chains = requireInteger(counts.chains, "manifest.counts.chains", 1);
  const foods = requireInteger(counts.foods, "manifest.counts.foods", 1);
  const provenance = requireInteger(counts.provenance, "manifest.counts.provenance", 1);
  if (chains > MAX_CHAINS) fail(`manifest exceeds the ${MAX_CHAINS}-chain import limit`);
  if (foods > MAX_ROWS || provenance > MAX_ROWS) {
    fail(`manifest exceeds the ${MAX_ROWS}-row import limit`);
  }

  return manifest as unknown as TransferManifest;
}

function validateBatch(value: unknown, index: number): TransferBatch {
  const label = `batches row ${index + 1}`;
  const row = asRecord(value, label);
  assertExactKeys(
    row,
    [
      "approved_at",
      "audit_model",
      "audit_sha256",
      "audit_usage",
      "audit_verdict",
      "batch_key",
      "candidate_sha256",
      "chain",
      "checked_rows",
      "expected_rows",
      "pipeline_job_slug",
    ],
    label,
  );
  const batchKey = requireSha256(row.batch_key, `${label}.batch_key`);
  const chain = requireText(row.chain, `${label}.chain`, 120);
  const candidate = requireSha256(row.candidate_sha256, `${label}.candidate_sha256`);
  const audit = requireSha256(row.audit_sha256, `${label}.audit_sha256`);
  const expected = requireInteger(row.expected_rows, `${label}.expected_rows`, 1);
  const checked = requireInteger(row.checked_rows, `${label}.checked_rows`, 1);
  if (row.audit_verdict !== "PASS") fail(`${label}.audit_verdict must be PASS`);
  if (checked !== expected) fail(`${label} has incomplete audit coverage`);
  const expectedBatchKey = canonicalJsonSha256({
    chain,
    candidate_sha256: candidate,
    audit_sha256: audit,
  });
  if (batchKey !== expectedBatchKey) fail(`${label}.batch_key does not match its audited artifacts`);
  requireText(row.pipeline_job_slug, `${label}.pipeline_job_slug`, 160);
  requireText(row.audit_model, `${label}.audit_model`, 160);
  requireTimestamp(row.approved_at, `${label}.approved_at`);
  asRecord(row.audit_usage, `${label}.audit_usage`);
  return row as unknown as TransferBatch;
}

function validateFood(value: unknown, index: number): TransferFood {
  const label = `foods row ${index + 1}`;
  const row = asRecord(value, label);
  assertExactKeys(row, FOOD_KEYS, label);
  requireText(row.name, `${label}.name`, 300);
  const brand = requireText(row.brand, `${label}.brand`, 120);
  const slug = requireText(row.brand_slug, `${label}.brand_slug`, 120);
  if (slug !== brandSlug(brand)) fail(`${label}.brand_slug does not match brand`);
  if (!Array.isArray(row.search_aliases) || row.search_aliases.length === 0 || row.search_aliases.length > 16) {
    fail(`${label}.search_aliases must contain between 1 and 16 values`);
  }
  for (const [aliasIndex, alias] of row.search_aliases.entries()) {
    requireText(alias, `${label}.search_aliases[${aliasIndex}]`, 120);
  }
  optionalText(row.source_category, `${label}.source_category`, 200);
  optionalText(row.variant_label, `${label}.variant_label`, 120);
  requireText(row.serving_size, `${label}.serving_size`, 160);
  optionalNumber(row.serving_size_grams, `${label}.serving_size_grams`);
  for (const key of NUTRIENT_KEYS) requireNumber(row[key], `${label}.${key}`);
  for (const key of NULLABLE_NUTRIENT_KEYS) optionalNumber(row[key], `${label}.${key}`);
  if (row.fdc_id !== null || row.barcode !== null || row.embedding !== null) {
    fail(`${label} cannot set fdc_id, barcode, or embedding`);
  }
  if (row.source !== "restaurant_official") fail(`${label}.source is not restaurant_official`);
  optionalExternalId(row.source_external_id, `${label}.source_external_id`);
  const identity = requireText(row.source_identity_key, `${label}.source_identity_key`, 200);
  if (!new RegExp(`^restaurant:${slug}:[a-f0-9]{64}$`).test(identity)) {
    fail(`${label}.source_identity_key has the wrong contract shape or brand prefix`);
  }
  const contentHash = requireSha256(row.content_hash, `${label}.content_hash`);
  if (row.is_active !== true) fail(`${label}.is_active must be true`);
  requireTimestamp(row.verified_at, `${label}.verified_at`);

  const content = {
    source_identity_key: identity,
    serving_size: row.serving_size,
    calories: row.calories,
    protein: row.protein,
    total_fat: row.total_fat,
    saturated_fat: row.saturated_fat,
    cholesterol: row.cholesterol,
    sodium: row.sodium,
    total_carbohydrates: row.total_carbohydrates,
    fiber: row.fiber,
    sugar: row.sugar,
  };
  if (canonicalJsonSha256(content) !== contentHash) {
    fail(`${label}.content_hash does not match serving and nutrient content`);
  }
  return row as unknown as TransferFood;
}

function validateProvenance(value: unknown, index: number): TransferProvenance {
  const label = `provenance row ${index + 1}`;
  const row = asRecord(value, label);
  assertExactKeys(
    row,
    [
      "authorization_url",
      "batch_key",
      "content_hash",
      "evidence",
      "nutrient_qualifiers",
      "page_number",
      "pipeline_display_name",
      "pipeline_row_id",
      "raw_nutrients",
      "source_category",
      "source_id",
      "source_identity_key",
      "source_section",
      "source_sha256",
      "source_url",
      "value_method",
    ],
    label,
  );
  requireSha256(row.batch_key, `${label}.batch_key`);
  requireText(row.source_identity_key, `${label}.source_identity_key`, 200);
  requireSha256(row.content_hash, `${label}.content_hash`);
  requireText(row.pipeline_row_id, `${label}.pipeline_row_id`, 200);
  requireText(row.pipeline_display_name, `${label}.pipeline_display_name`, 500);
  requireHttpsUrl(row.source_url, `${label}.source_url`);
  if (row.authorization_url !== null) requireHttpsUrl(row.authorization_url, `${label}.authorization_url`);
  requireText(row.source_id, `${label}.source_id`, 200);
  if (row.source_sha256 !== null) requireSha256(row.source_sha256, `${label}.source_sha256`);
  if (row.page_number !== null) requireInteger(row.page_number, `${label}.page_number`, 1);
  optionalText(row.source_section, `${label}.source_section`, 200);
  optionalText(row.source_category, `${label}.source_category`, 200);
  requireText(row.value_method, `${label}.value_method`, 200);
  if (!Array.isArray(row.evidence) || row.evidence.length === 0 || row.evidence.length > 32) {
    fail(`${label}.evidence must contain between 1 and 32 records`);
  }
  for (const [evidenceIndex, evidence] of row.evidence.entries()) {
    asRecord(evidence, `${label}.evidence[${evidenceIndex}]`);
  }
  const raw = asRecord(row.raw_nutrients, `${label}.raw_nutrients`);
  assertExactKeys(raw, RAW_NUTRIENT_KEYS, `${label}.raw_nutrients`);
  for (const key of RAW_NUTRIENT_KEYS) requireText(raw[key], `${label}.raw_nutrients.${key}`, 80);
  const qualifiers = asRecord(row.nutrient_qualifiers, `${label}.nutrient_qualifiers`);
  for (const [key, qualifier] of Object.entries(qualifiers)) {
    if (![...NUTRIENT_KEYS].includes(key as (typeof NUTRIENT_KEYS)[number])) {
      fail(`${label}.nutrient_qualifiers contains unsupported nutrient ${key}`);
    }
    asRecord(qualifier, `${label}.nutrient_qualifiers.${key}`);
  }
  return row as unknown as TransferProvenance;
}

function validateReport(value: unknown): DryRunReport {
  const row = asRecord(value, "dry_run_report.json");
  assertExactKeys(
    row,
    [
      "chain_count",
      "chains",
      "created_at",
      "food_row_count",
      "page_variant_identity_count",
      "provenance_row_count",
      "qualified_value_count",
      "rows_with_serving_grams",
      "rule",
      "status",
    ],
    "dry_run_report.json",
  );
  if (row.status !== "DRY_RUN_ONLY_NOT_IMPORTED") fail("bundle is not marked dry-run only");
  requireTimestamp(row.created_at, "dry_run_report.created_at");
  if (!Array.isArray(row.chains)) fail("dry_run_report.chains must be an array");
  for (const [index, chain] of row.chains.entries()) requireText(chain, `dry_run_report.chains[${index}]`, 120);
  for (const key of [
    "chain_count",
    "food_row_count",
    "page_variant_identity_count",
    "provenance_row_count",
    "qualified_value_count",
    "rows_with_serving_grams",
  ]) {
    requireInteger(row[key], `dry_run_report.${key}`);
  }
  requireText(row.rule, "dry_run_report.rule", 500);
  if (row.rule !== "This bundle is an offline transfer artifact. It does not write Supabase.") {
    fail("dry_run_report.rule differs from the v1 no-write contract");
  }
  return row as unknown as DryRunReport;
}

export function loadRestaurantImportBundle(input: string): ValidatedRestaurantImport {
  const root = resolve(input);
  const manifest = validateManifest(parseJson(resolve(root, "manifest.json"), "manifest.json"));

  for (const filename of REQUIRED_FILES) {
    let actual: string;
    try {
      actual = sha256Bytes(readFileSync(resolve(root, filename)));
    } catch (error) {
      fail(`${filename} could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    if (actual !== manifest.files[filename]) fail(`${filename} hash mismatch`);
  }

  const batchesRaw = parseJson(resolve(root, "batches.json"), "batches.json");
  if (!Array.isArray(batchesRaw)) fail("batches.json must be an array");
  const foodsRaw = parseJsonl(resolve(root, "foods.jsonl"), "foods.jsonl");
  const provenanceRaw = parseJsonl(resolve(root, "provenance.jsonl"), "provenance.jsonl");
  const batches = batchesRaw.map(validateBatch);
  const foods = foodsRaw.map(validateFood);
  const provenance = provenanceRaw.map(validateProvenance);
  const report = validateReport(parseJson(resolve(root, "dry_run_report.json"), "dry_run_report.json"));

  if (batches.length !== manifest.counts.chains || foods.length !== manifest.counts.foods || provenance.length !== manifest.counts.provenance) {
    fail("actual row counts differ from manifest counts");
  }
  if (foods.length !== provenance.length) fail("every food must have exactly one provenance row");
  if (
    report.created_at !== manifest.created_at ||
    report.chain_count !== batches.length ||
    report.food_row_count !== foods.length ||
    report.provenance_row_count !== provenance.length
  ) {
    fail("dry-run report counts or creation timestamp differ from the manifest");
  }
  const reportChains = report.chains;
  if (reportChains.length !== batches.length || reportChains.some((chain, index) => chain !== batches[index].chain)) {
    fail("dry-run report chain order differs from batches.json");
  }
  if (report.rows_with_serving_grams !== foods.filter((food) => food.serving_size_grams !== null).length) {
    fail("dry-run serving-gram count differs from food rows");
  }
  const qualifiedValueCount = provenance.reduce(
    (count, row) => count + Object.keys(row.nutrient_qualifiers).length,
    0,
  );
  if (report.qualified_value_count !== qualifiedValueCount) {
    fail("dry-run qualified-value count differs from provenance rows");
  }

  const batchByKey = new Map<string, TransferBatch>();
  for (const batch of batches) {
    if (batchByKey.has(batch.batch_key)) fail(`duplicate batch_key ${batch.batch_key}`);
    batchByKey.set(batch.batch_key, batch);
  }
  const versionByKey = new Map<string, TransferFood>();
  const activeIdentities = new Set<string>();
  for (const food of foods) {
    const versionKey = `${food.source_identity_key}\u0000${food.content_hash}`;
    if (versionByKey.has(versionKey)) fail(`duplicate food identity/content version ${food.source_identity_key}`);
    if (activeIdentities.has(food.source_identity_key)) fail(`multiple active rows share ${food.source_identity_key}`);
    activeIdentities.add(food.source_identity_key);
    versionByKey.set(versionKey, food);
  }

  const provenancePairs = new Set<string>();
  const provenanceRows = new Set<string>();
  const rowCountByBatch = new Map<string, number>();
  for (const source of provenance) {
    const batch = batchByKey.get(source.batch_key);
    if (!batch) fail(`provenance ${source.pipeline_row_id} references an unknown batch`);
    const versionKey = `${source.source_identity_key}\u0000${source.content_hash}`;
    const food = versionByKey.get(versionKey);
    if (!food) fail(`provenance ${source.pipeline_row_id} has no matching food version`);
    if (food.brand !== batch.chain || food.brand_slug !== brandSlug(batch.chain)) {
      fail(`provenance ${source.pipeline_row_id} joins a food to the wrong chain`);
    }
    if (food.verified_at !== batch.approved_at) {
      fail(`food ${food.source_identity_key} verification time differs from its audit batch`);
    }
    if (source.source_category !== food.source_category) {
      fail(`provenance ${source.pipeline_row_id} category differs from its food`);
    }
    const rowKey = `${source.batch_key}\u0000${source.pipeline_row_id}`;
    if (provenanceRows.has(rowKey)) fail(`duplicate pipeline row ${source.pipeline_row_id} in one batch`);
    if (provenancePairs.has(versionKey)) fail(`food version ${food.source_identity_key} has multiple provenance rows`);
    provenanceRows.add(rowKey);
    provenancePairs.add(versionKey);
    rowCountByBatch.set(source.batch_key, (rowCountByBatch.get(source.batch_key) ?? 0) + 1);
  }
  for (const batch of batches) {
    if ((rowCountByBatch.get(batch.batch_key) ?? 0) !== batch.expected_rows) {
      fail(`${batch.chain} transferred row count differs from its audit`);
    }
  }

  const payload: RestaurantImportPayload = {
    contract: RESTAURANT_IMPORT_CONTRACT,
    counts: manifest.counts,
    batches,
    foods,
    provenance,
  };
  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (payloadBytes > MAX_BUNDLE_BYTES) fail(`RPC payload exceeds ${MAX_BUNDLE_BYTES} bytes`);
  return { root, manifest, report, payload, payloadBytes };
}

export function assertRestaurantImportResult(
  value: unknown,
  expected: TransferManifest["counts"],
): RestaurantImportResult {
  const result = asRecord(value, "import RPC result");
  assertExactKeys(
    result,
    [
      "batch_rows",
      "contract",
      "deactivated_food_versions",
      "food_rows",
      "inserted_batches",
      "inserted_food_versions",
      "inserted_provenance",
      "provenance_rows",
      "reactivated_food_versions",
      "status",
    ],
    "import RPC result",
  );
  if (result.contract !== RESTAURANT_IMPORT_CONTRACT) fail("RPC returned the wrong contract");
  if (result.status !== "IMPORTED" && result.status !== "IDEMPOTENT_REPLAY") {
    fail("RPC returned an unknown status");
  }
  if (
    result.batch_rows !== expected.chains ||
    result.food_rows !== expected.foods ||
    result.provenance_rows !== expected.provenance
  ) {
    fail("RPC accepted counts differ from the validated manifest");
  }
  for (const key of [
    "inserted_batches",
    "inserted_food_versions",
    "reactivated_food_versions",
    "deactivated_food_versions",
    "inserted_provenance",
  ]) {
    requireInteger(result[key], `import RPC result.${key}`);
  }
  if (result.status === "IDEMPOTENT_REPLAY" && [
    result.inserted_batches,
    result.inserted_food_versions,
    result.reactivated_food_versions,
    result.deactivated_food_versions,
    result.inserted_provenance,
  ].some((count) => count !== 0)) {
    fail("RPC labeled a mutating import as an idempotent replay");
  }
  return result as unknown as RestaurantImportResult;
}
