import { createClient } from "@supabase/supabase-js";
import type {
  WhoopTokens,
  WhoopTokenResponse,
  WhoopCycle,
  WhoopRecovery,
  WhoopSleep,
  WhoopPaginatedResponse,
} from "./types";

const WHOOP_API_BASE = "https://api.prod.whoop.com";

// Server-side Supabase client
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Get stored tokens
export async function getStoredTokens(): Promise<WhoopTokens | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("whoop_tokens")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as WhoopTokens;
}

// Store tokens
export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  whoopUserId?: number
): Promise<void> {
  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Delete existing tokens first (single user)
  await supabase.from("whoop_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Insert new tokens
  await supabase.from("whoop_tokens").insert({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    whoop_user_id: whoopUserId || null,
  });
}

// Delete tokens
export async function deleteTokens(): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("whoop_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

// Check if token is expired
export function isTokenExpired(tokens: WhoopTokens): boolean {
  const expiresAt = new Date(tokens.expires_at).getTime();
  const now = Date.now();
  // Consider expired if less than 5 minutes remaining
  return expiresAt - now < 5 * 60 * 1000;
}

// Refresh access token
export async function refreshAccessToken(
  refreshToken: string
): Promise<WhoopTokenResponse> {
  const response = await fetch(`${WHOOP_API_BASE}/oauth/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${response.statusText}`);
  }

  return response.json();
}

// Get valid access token (refreshes if needed)
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens) return null;

  if (isTokenExpired(tokens)) {
    try {
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      await storeTokens(
        newTokens.access_token,
        newTokens.refresh_token,
        newTokens.expires_in,
        tokens.whoop_user_id || undefined
      );
      return newTokens.access_token;
    } catch {
      // Refresh failed, tokens are invalid
      await deleteTokens();
      return null;
    }
  }

  return tokens.access_token;
}

// Generic API request helper
async function whoopFetch<T>(
  endpoint: string,
  accessToken: string
): Promise<T> {
  const url = `${WHOOP_API_BASE}${endpoint}`;
  console.log(`[Whoop API] Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`[Whoop API] Error ${response.status} for ${endpoint}:`, errorBody);
    throw new Error(`Whoop API error: ${response.status} ${response.statusText} - ${endpoint}`);
  }

  return response.json();
}

// Fetch all pages for a paginated endpoint
async function fetchAllPages<T>(
  endpoint: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<T[]> {
  const allRecords: T[] = [];
  let nextToken: string | null = null;

  do {
    const params = new URLSearchParams({
      start: `${startDate}T00:00:00.000Z`,
      end: `${endDate}T23:59:59.999Z`,
      limit: "25",
    });

    if (nextToken) {
      params.set("nextToken", nextToken);
    }

    const response = await whoopFetch<WhoopPaginatedResponse<T>>(
      `${endpoint}?${params}`,
      accessToken
    );

    if (response.records && response.records.length > 0) {
      allRecords.push(...response.records);
    }

    nextToken = response.next_token || null;
  } while (nextToken);

  return allRecords;
}

// Fetch cycles for date range (v2 API)
export async function fetchCycles(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<WhoopCycle[]> {
  return fetchAllPages<WhoopCycle>(
    "/developer/v2/cycle",
    accessToken,
    startDate,
    endDate
  );
}

// Fetch recoveries for date range (v2 API - standalone endpoint)
export async function fetchRecoveries(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<WhoopRecovery[]> {
  return fetchAllPages<WhoopRecovery>(
    "/developer/v2/recovery",
    accessToken,
    startDate,
    endDate
  );
}

// Fetch sleep for date range (v2 API - standalone endpoint)
export async function fetchSleep(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<WhoopSleep[]> {
  return fetchAllPages<WhoopSleep>(
    "/developer/v2/activity/sleep",
    accessToken,
    startDate,
    endDate
  );
}
