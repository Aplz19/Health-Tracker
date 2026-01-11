import { NextRequest, NextResponse } from "next/server";
import { syncDailySummary } from "@/lib/daily-summary/aggregate";
import { supabase } from "@/lib/supabase/client";

// GET - Fetch existing summary for a date
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Date parameter required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("daily_summaries")
      .select("*")
      .eq("date", date)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return NextResponse.json({ summary: data || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - Generate/update summary for a date (or date range)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, startDate, endDate } = body;

    // Single date sync
    if (date) {
      const data = await syncDailySummary(date);
      return NextResponse.json({ success: true, summary: data });
    }

    // Date range sync
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const results = [];

      for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const data = await syncDailySummary(dateStr);
        results.push(data);
      }

      return NextResponse.json({ success: true, count: results.length, summaries: results });
    }

    return NextResponse.json({ error: "Date or date range required" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
