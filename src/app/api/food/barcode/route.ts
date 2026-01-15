import { NextRequest, NextResponse } from "next/server";

const OFF_US_API = "https://us.openfoodfacts.org/api/v2";
const OFF_WORLD_API = "https://world.openfoodfacts.org/api/v2";

// Cache for barcode lookups
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function GET(request: NextRequest) {
  const barcode = request.nextUrl.searchParams.get("barcode");

  if (!barcode) {
    return NextResponse.json({ error: "Barcode is required" }, { status: 400 });
  }

  // Clean barcode
  const cleanBarcode = barcode.replace(/[\s-]/g, "");

  // Check cache
  const cached = cache.get(cleanBarcode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Try US database first
    let response = await fetch(`${OFF_US_API}/product/${cleanBarcode}.json`, {
      headers: {
        "User-Agent": "HealthTracker/1.0",
      },
    });

    let data = await response.json();

    // If not found in US, try world database
    if (data.status === 0) {
      response = await fetch(`${OFF_WORLD_API}/product/${cleanBarcode}.json`, {
        headers: {
          "User-Agent": "HealthTracker/1.0",
        },
      });
      data = await response.json();
    }

    // Cache the result
    cache.set(cleanBarcode, { data, timestamp: Date.now() });

    // Clean old cache entries
    if (cache.size > 500) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          cache.delete(key);
        }
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Barcode lookup error:", error);
    return NextResponse.json(
      { error: "Failed to lookup barcode" },
      { status: 500 }
    );
  }
}
