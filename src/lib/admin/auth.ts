import { timingSafeEqual } from "node:crypto";

const AUTHORIZATION_BUFFER_BYTES = 8 * 1024;

export const ADMIN_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Compare a complete Authorization header without normalizing whitespace,
 * casing, or the secret. Fixed-size buffers avoid a content-dependent compare.
 */
export function hasValidAdminBearerAuthorization(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;

  const supplied = authorization ?? "";
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.byteLength(supplied, "utf8");
  const expectedBytes = Buffer.byteLength(expected, "utf8");

  if (
    suppliedBytes > AUTHORIZATION_BUFFER_BYTES ||
    expectedBytes > AUTHORIZATION_BUFFER_BYTES
  ) {
    return false;
  }

  const suppliedBuffer = Buffer.alloc(AUTHORIZATION_BUFFER_BYTES);
  const expectedBuffer = Buffer.alloc(AUTHORIZATION_BUFFER_BYTES);
  suppliedBuffer.write(supplied, "utf8");
  expectedBuffer.write(expected, "utf8");

  const contentMatches = timingSafeEqual(suppliedBuffer, expectedBuffer);
  return suppliedBytes === expectedBytes && contentMatches;
}
