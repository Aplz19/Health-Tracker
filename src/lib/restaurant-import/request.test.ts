import assert from "node:assert/strict";
import test from "node:test";
import { hasValidAdminBearerAuthorization } from "../admin/auth";
import { RESTAURANT_IMPORT_CONTRACT } from "./contract";
import {
  MAX_RESTAURANT_IMPORT_BYTES,
  hashRestaurantImportBody,
  parseRestaurantImportContentLength,
  parseRestaurantImportAllowedSha256,
  parseRestaurantImportJson,
  readRestaurantImportBody,
  requireRestaurantImportEnvelope,
  RestaurantImportRequestError,
} from "./request";

function assertRequestError(action: () => unknown, status: number) {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof RestaurantImportRequestError);
    assert.equal(error.status, status);
    return true;
  });
}

test("admin bearer authorization is exact and fails closed", () => {
  assert.equal(hasValidAdminBearerAuthorization("Bearer top-secret", "top-secret"), true);
  assert.equal(hasValidAdminBearerAuthorization("Bearer top-secret ", "top-secret"), false);
  assert.equal(hasValidAdminBearerAuthorization("bearer top-secret", "top-secret"), false);
  assert.equal(hasValidAdminBearerAuthorization("Bearer wrong", "top-secret"), false);
  assert.equal(hasValidAdminBearerAuthorization(null, "top-secret"), false);
  assert.equal(hasValidAdminBearerAuthorization("Bearer ", undefined), false);
});

test("restaurant import allowlist accepts only exact lowercase body hashes", () => {
  const body = '{"contract":"health-tracker-restaurant-foods-v1"}';
  const hash = hashRestaurantImportBody(body);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(parseRestaurantImportAllowedSha256(hash)?.has(hash), true);
  assert.equal(
    parseRestaurantImportAllowedSha256(`${"0".repeat(64)}, ${hash}`)?.has(hash),
    true,
  );
  assert.equal(hashRestaurantImportBody(`${body}\n`) === hash, false);
  assert.equal(parseRestaurantImportAllowedSha256(undefined), null);
  assert.equal(parseRestaurantImportAllowedSha256(hash.toUpperCase()), null);
  assert.equal(parseRestaurantImportAllowedSha256(`${hash},not-a-hash`), null);
});

test("content length is mandatory, numeric, nonzero, and capped at four MiB", () => {
  assert.equal(parseRestaurantImportContentLength("1372767"), 1_372_767);
  assert.equal(parseRestaurantImportContentLength("0001"), 1);
  assertRequestError(() => parseRestaurantImportContentLength(null), 411);
  assertRequestError(() => parseRestaurantImportContentLength(""), 400);
  assertRequestError(() => parseRestaurantImportContentLength("1.5"), 400);
  assertRequestError(() => parseRestaurantImportContentLength("0"), 400);
  assertRequestError(
    () => parseRestaurantImportContentLength(String(MAX_RESTAURANT_IMPORT_BYTES + 1)),
    413,
  );
});

test("streamed body must exactly match its declared length", async () => {
  const bytes = new TextEncoder().encode('{"ok":true}');
  const exact = new Request("https://example.test/import", {
    method: "POST",
    body: bytes,
  });
  assert.deepEqual(await readRestaurantImportBody(exact, bytes.byteLength), bytes);

  const tooLong = new Request("https://example.test/import", {
    method: "POST",
    body: bytes,
  });
  await assert.rejects(
    readRestaurantImportBody(tooLong, bytes.byteLength - 1),
    (error: unknown) => error instanceof RestaurantImportRequestError && error.status === 400,
  );

  const tooShort = new Request("https://example.test/import", {
    method: "POST",
    body: bytes,
  });
  await assert.rejects(
    readRestaurantImportBody(tooShort, bytes.byteLength + 1),
    (error: unknown) => error instanceof RestaurantImportRequestError && error.status === 400,
  );
});

test("JSON and shallow v1 envelope validation reject malformed payloads", () => {
  assertRequestError(
    () => parseRestaurantImportJson(new TextEncoder().encode("not-json")),
    400,
  );

  const payload = {
    contract: RESTAURANT_IMPORT_CONTRACT,
    counts: { chains: 1, foods: 1, provenance: 1 },
    batches: [{}],
    foods: [{}],
    provenance: [{}],
  };
  assert.equal(requireRestaurantImportEnvelope(payload), payload);
  assertRequestError(
    () => requireRestaurantImportEnvelope({ ...payload, foods: [] }),
    422,
  );
  assertRequestError(
    () => requireRestaurantImportEnvelope({ ...payload, contract: "other-contract" }),
    422,
  );
});
