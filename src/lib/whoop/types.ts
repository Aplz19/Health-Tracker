// Whoop API Response Types

export interface WhoopTokens {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  whoop_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// Cycle (contains strain data)
export interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string | null;
  timezone_offset: string;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  } | null;
}

// Recovery
export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  } | null;
}

// Sleep
export interface WhoopSleep {
  id: string;
  cycle_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  } | null;
}

// Workout
export interface WhoopWorkout {
  id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    altitude_change_meter?: number;
    zone_duration: {
      zone_zero_milli: number;
      zone_one_milli: number;
      zone_two_milli: number;
      zone_three_milli: number;
      zone_four_milli: number;
      zone_five_milli: number;
    };
  } | null;
}

// Paginated response wrapper
export interface WhoopPaginatedResponse<T> {
  records: T[];
  next_token: string | null;
}

// Whoop sport ID to name mapping
export const WHOOP_SPORT_NAMES: Record<number, string> = {
  [-1]: "Activity",
  0: "Running",
  1: "Cycling",
  16: "Baseball",
  17: "Basketball",
  18: "Rowing",
  19: "Fencing",
  20: "Field Hockey",
  21: "Football",
  22: "Golf",
  24: "Ice Hockey",
  25: "Lacrosse",
  27: "Rugby",
  28: "Sailing",
  29: "Skiing",
  30: "Soccer",
  31: "Softball",
  32: "Squash",
  33: "Swimming",
  34: "Tennis",
  35: "Track & Field",
  36: "Volleyball",
  37: "Water Polo",
  38: "Wrestling",
  39: "Boxing",
  42: "Dance",
  43: "Pilates",
  44: "Yoga",
  45: "Weightlifting",
  47: "Cross Country Skiing",
  48: "Functional Fitness",
  49: "Duathlon",
  51: "Gymnastics",
  52: "HIIT",
  53: "Kayaking",
  55: "Powerlifting",
  56: "Rock Climbing",
  57: "Paddleboarding",
  59: "Triathlon",
  60: "Walking",
  61: "Surfing",
  62: "Elliptical",
  63: "Stairmaster",
  64: "Meditation",
  65: "Other",
  66: "Diving",
  70: "Wheelchair Pushing",
  71: "Caddying",
  73: "Hiking",
  74: "Spin",
  75: "Jiu Jitsu",
  76: "Manual Labor",
  77: "Cricket",
  78: "Pickleball",
  79: "Inline Skating",
  80: "Snowboarding",
  82: "Canoeing",
  83: "Ultimate",
  84: "Climber",
  85: "Jumping Rope",
  86: "Australian Football",
  87: "Martial Arts",
  88: "Badminton",
  89: "Netball",
  90: "Barre",
  91: "Assault Bike",
  92: "Skateboarding",
  93: "Motorsport",
  94: "Horseback Riding",
  95: "Commuting",
  96: "Table Tennis",
};

export function getWhoopSportName(sportId: number | null): string {
  if (sportId === null) return "Workout";
  return WHOOP_SPORT_NAMES[sportId] || "Workout";
}

// Cached data in Supabase
export interface WhoopDayData {
  id: string;
  date: string;
  cycle_id: number | null;
  recovery_score: number | null;
  hrv_rmssd: number | null;
  resting_heart_rate: number | null;
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  sleep_id: string | null;
  sleep_score: number | null;
  sleep_duration_minutes: number | null;
  strain_score: number | null;
  kilojoules: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
