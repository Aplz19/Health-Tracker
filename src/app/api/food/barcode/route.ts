import { NextRequest, NextResponse } from "next/server";
import { lookupBarcode, type BarcodeResult } from "@/lib/openfoodfacts/client";

// Cache transformed lookups. Note: on serverless this only persists within a
// warm instance — the durable cache is the `foods` table (see food DB plan).
const cache = new Map<string, { result: BarcodeResult; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function GET(request: NextRequest) {
  const barcode = request.nextUrl.searchParams.get("barcode");

  if (!barcode) {
    return NextResponse.json(
      { found: false, error: "Barcode is required" },
      { status: 400 }
    );
  }

  const cleanBarcode = barcode.replace(/[\s-]/g, "");

  const cached = cache.get(cleanBarcode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.result);
  }

  try {
    const result = await lookupBarcode(cleanBarcode);

    cache.set(cleanBarcode, { result, timestamp: Date.now() });

    // Evict stale entries once the cache grows large
    if (cache.size > 500) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          cache.delete(key);
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Barcode lookup error:", error);
    return NextResponse.json(
      { found: false, error: "Failed to lookup barcode" },
      { status: 500 }
    );
  }
}
