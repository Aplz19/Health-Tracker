import { createHash } from "node:crypto";
import { RESTAURANT_IMPORT_CONTRACT } from "./contract";

export const MAX_RESTAURANT_IMPORT_BYTES = 4 * 1024 * 1024;

const MAX_CHAINS = 64;
const MAX_ROWS = 20_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class RestaurantImportRequestError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "RestaurantImportRequestError";
  }
}

export interface RestaurantImportEnvelope {
  contract: typeof RESTAURANT_IMPORT_CONTRACT;
  counts: {
    chains: number;
    foods: number;
    provenance: number;
  };
  batches: unknown[];
  foods: unknown[];
  provenance: unknown[];
}

export function hashRestaurantImportBody(body: string | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

/** Invalid or empty configuration returns null so callers fail closed. */
export function parseRestaurantImportAllowedSha256(
  value: string | undefined,
): ReadonlySet<string> | null {
  if (!value) return null;
  const hashes = value.split(",").map((hash) => hash.trim());
  if (hashes.length === 0 || hashes.some((hash) => !SHA256_PATTERN.test(hash))) {
    return null;
  }
  return new Set(hashes);
}

function fail(status: number, message: string): never {
  throw new RestaurantImportRequestError(status, message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validCount(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum;
}

export function parseRestaurantImportContentLength(value: string | null): number {
  if (value === null) fail(411, "Content-Length is required");
  if (!/^\d+$/.test(value)) fail(400, "Invalid Content-Length");

  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    fail(400, "Invalid Content-Length");
  }
  if (contentLength > MAX_RESTAURANT_IMPORT_BYTES) {
    fail(413, "Request body is too large");
  }
  return contentLength;
}

/** Read the request incrementally so a false Content-Length cannot bypass the cap. */
export async function readRestaurantImportBody(
  request: Request,
  declaredLength: number,
): Promise<Uint8Array> {
  if (!request.body) fail(400, "Request body is required");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      received += value.byteLength;
      if (received > MAX_RESTAURANT_IMPORT_BYTES) {
        await reader.cancel();
        fail(413, "Request body is too large");
      }
      if (received > declaredLength) {
        await reader.cancel();
        fail(400, "Content-Length does not match request body");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (received !== declaredLength) {
    fail(400, "Content-Length does not match request body");
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function parseRestaurantImportJson(body: Uint8Array): unknown {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return JSON.parse(text) as unknown;
  } catch {
    return fail(400, "Invalid JSON body");
  }
}

/**
 * This is intentionally a shallow transport check. The security-definer RPC
 * revalidates the full contract inside the same transaction as the import.
 */
export function requireRestaurantImportEnvelope(value: unknown): RestaurantImportEnvelope {
  const payload = asRecord(value);
  const counts = payload ? asRecord(payload.counts) : null;
  const batches = payload?.batches;
  const foods = payload?.foods;
  const provenance = payload?.provenance;

  if (
    !payload ||
    payload.contract !== RESTAURANT_IMPORT_CONTRACT ||
    !counts ||
    !validCount(counts.chains, MAX_CHAINS) ||
    !validCount(counts.foods, MAX_ROWS) ||
    !validCount(counts.provenance, MAX_ROWS) ||
    !Array.isArray(batches) ||
    !Array.isArray(foods) ||
    !Array.isArray(provenance) ||
    batches.length !== counts.chains ||
    foods.length !== counts.foods ||
    provenance.length !== counts.provenance
  ) {
    fail(422, "Invalid restaurant import payload");
  }

  return payload as unknown as RestaurantImportEnvelope;
}
