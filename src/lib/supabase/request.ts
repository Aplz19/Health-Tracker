import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

/** A request-scoped Supabase client that carries the signed-in user's cookies. */
export function getRequestSupabase(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Route handlers in this app only read auth state. The proxy owns
        // session refreshes, so there is no response cookie target here.
        setAll() {},
      },
    }
  );
}
