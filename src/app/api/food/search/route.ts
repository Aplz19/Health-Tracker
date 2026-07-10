import { NextRequest, NextResponse } from "next/server";
import { searchFoodsServer } from "@/lib/food/server-search";
import { normalizeFoodSearchQuery } from "@/lib/food/search-query";
import { getRequestSupabase } from "@/lib/supabase/request";

const RATE_WINDOW_MS = 60_000;
const MAX_SEARCHES_PER_WINDOW = 60;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const current = rateWindows.get(userId);
  if (!current || current.startedAt + RATE_WINDOW_MS <= now) {
    rateWindows.set(userId, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_SEARCHES_PER_WINDOW;
}

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isRateLimited(user.id)) {
    return NextResponse.json({ error: "Too many searches; try again shortly" }, { status: 429 });
  }

  const query = normalizeFoodSearchQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (query.length < 2) {
    return NextResponse.json({ error: "Search must contain at least 2 characters" }, { status: 400 });
  }

  try {
    const result = await searchFoodsServer(supabase, query);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    console.error("Global food search failed", error);
    return NextResponse.json({ error: "Global food search is unavailable" }, { status: 503 });
  }
}
