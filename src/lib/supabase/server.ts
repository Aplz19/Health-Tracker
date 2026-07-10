import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client with service role key (bypasses RLS)
// Only use this in API routes and server-side code, NEVER in client components
export function getServerSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not set, falling back to anon key");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Privileged client for server-owned imports. Unlike the legacy helper above,
 * this fails closed instead of silently running an admin workflow as anon.
 */
export function getRequiredServerSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this operation");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
}
