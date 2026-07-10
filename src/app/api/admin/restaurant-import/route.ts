import { NextResponse } from "next/server";
import {
  ADMIN_NO_STORE_HEADERS,
  hasValidAdminBearerAuthorization,
} from "@/lib/admin/auth";
import { getRequiredServerSupabase } from "@/lib/supabase/server";
import {
  parseRestaurantImportContentLength,
  hashRestaurantImportBody,
  parseRestaurantImportAllowedSha256,
  parseRestaurantImportJson,
  readRestaurantImportBody,
  requireRestaurantImportEnvelope,
  RestaurantImportRequestError,
} from "@/lib/restaurant-import/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: ADMIN_NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const importSecret = process.env.RESTAURANT_IMPORT_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const allowedHashes = parseRestaurantImportAllowedSha256(
    process.env.RESTAURANT_IMPORT_ALLOWED_SHA256,
  );

  if (!importSecret || !allowedHashes || !serviceRoleKey || !supabaseUrl) {
    return errorResponse("Restaurant import bridge is not configured", 503);
  }
  if (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return errorResponse("Restaurant import bridge is not configured", 503);
  }
  if (!hasValidAdminBearerAuthorization(request.headers.get("authorization"), importSecret)) {
    return errorResponse("Unauthorized", 401);
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return errorResponse("Content-Type must be application/json", 415);
  }
  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    return errorResponse("Content-Encoding is not supported", 415);
  }

  let payload;
  try {
    const contentLength = parseRestaurantImportContentLength(
      request.headers.get("content-length"),
    );
    const body = await readRestaurantImportBody(request, contentLength);
    if (!allowedHashes.has(hashRestaurantImportBody(body))) {
      return errorResponse("Restaurant import payload is not approved", 403);
    }
    payload = requireRestaurantImportEnvelope(parseRestaurantImportJson(body));
  } catch (error) {
    if (error instanceof RestaurantImportRequestError) {
      return errorResponse(error.publicMessage, error.status);
    }
    return errorResponse("Invalid restaurant import request", 400);
  }

  try {
    const supabase = getRequiredServerSupabase();
    const { data, error } = await supabase.rpc("import_restaurant_food_bundle", {
      bundle: payload,
    });
    if (error) return errorResponse("Restaurant import RPC failed", 502);
    return NextResponse.json(data, { headers: ADMIN_NO_STORE_HEADERS });
  } catch {
    return errorResponse("Restaurant import RPC failed", 502);
  }
}
