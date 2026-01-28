import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getValidAccessToken, fetchWorkouts } from "@/lib/whoop/client";

function getSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function getUserFromRequest(request: NextRequest) {
  const serverSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
      },
    }
  );
  const { data: { user } } = await serverSupabase.auth.getUser();
  return user;
}

// POST sync workouts from Whoop API
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const accessToken = await getValidAccessToken(user.id);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not connected to Whoop" },
        { status: 401 }
      );
    }

    // Parse request body for date range
    const body = await request.json().catch(() => ({}));
    const days = body.days || 30;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    // Fetch workouts from Whoop API
    const workouts = await fetchWorkouts(accessToken, startStr, endStr);

    if (workouts.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        message: "No workouts found for date range",
        dateRange: { start: startStr, end: endStr },
      });
    }

    // Process and store workouts
    const supabase = getSupabase();
    const processedData = workouts.map(workout => ({
      user_id: user.id,
      whoop_workout_id: workout.id.toString(),
      start_time: workout.start,
      end_time: workout.end,
      sport_id: workout.sport_id,
      strain: workout.score?.strain ?? null,
      avg_hr: workout.score?.average_heart_rate ?? null,
      max_hr: workout.score?.max_heart_rate ?? null,
      raw_data: workout,
      synced_at: new Date().toISOString(),
    }));

    // Upsert workouts into database
    const { error } = await supabase
      .from("whoop_workouts")
      .upsert(processedData, { onConflict: "user_id,whoop_workout_id" });

    if (error) {
      console.error("Database upsert error:", error);
      return NextResponse.json(
        { error: "Failed to save workouts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      synced: processedData.length,
      dateRange: { start: startStr, end: endStr },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
