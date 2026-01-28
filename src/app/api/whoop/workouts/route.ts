import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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

// GET cached Whoop workouts (optionally filter by date or unlinked only)
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date");
  const unlinkedOnly = searchParams.get("unlinked") === "true";

  try {
    const supabase = getSupabase();

    let query = supabase
      .from("whoop_workouts")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time", { ascending: false });

    // Filter by date if provided
    if (date) {
      query = query
        .gte("start_time", `${date}T00:00:00.000Z`)
        .lt("start_time", `${date}T23:59:59.999Z`);
    }

    const { data: workouts, error } = await query;

    if (error) {
      console.error("Database fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch workouts" },
        { status: 500 }
      );
    }

    // If unlinkedOnly, filter out workouts that are already linked to a session
    if (unlinkedOnly && workouts && workouts.length > 0) {
      const whoopWorkoutIds = workouts.map(w => w.whoop_workout_id);

      const { data: linkedSessions } = await supabase
        .from("workout_sessions")
        .select("whoop_workout_id")
        .eq("user_id", user.id)
        .in("whoop_workout_id", whoopWorkoutIds);

      const linkedIds = new Set(linkedSessions?.map(s => s.whoop_workout_id) || []);
      const unlinkedWorkouts = workouts.filter(w => !linkedIds.has(w.whoop_workout_id));

      return NextResponse.json({ data: unlinkedWorkouts });
    }

    return NextResponse.json({ data: workouts || [] });
  } catch (err) {
    console.error("Fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch workouts" },
      { status: 500 }
    );
  }
}
