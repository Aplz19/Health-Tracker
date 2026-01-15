# Plan: Transition to Multiple Users

## Overview
Convert the single-user health tracker to support multiple users with proper authentication, data isolation, and row-level security.

**Important Note:** User has not started using the app yet, so existing data can be wiped. No migration of existing data needed.

---

## Phase 1: Supabase Auth Setup

### 1.1 Enable Authentication in Supabase Dashboard
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Email provider (email/password signup)
3. Optionally enable OAuth providers (Google, Apple, etc.) for easier login
4. Configure email templates for confirmation/reset (optional)

### 1.2 Auth Settings to Configure
- **Site URL:** `https://health-tracker-hazel.vercel.app` (production)
- **Redirect URLs:** Add both localhost and production URLs
- **Disable email confirmation** (optional, for easier testing): Authentication → Settings → Toggle off "Enable email confirmations"

### 1.3 Environment Variables
No new env vars needed - Supabase Auth uses the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` already configured.

---

## Phase 2: Database Schema Changes

### 2.1 Clear Existing Data (Fresh Start)
Since no real data exists yet, wipe all tables:

```sql
-- Clear all existing data
TRUNCATE meals CASCADE;
TRUNCATE food_logs CASCADE;
TRUNCATE foods CASCADE;
TRUNCATE exercises CASCADE;
TRUNCATE exercise_logs CASCADE;
TRUNCATE exercise_sets CASCADE;
TRUNCATE treadmill_sessions CASCADE;
TRUNCATE creatine_logs CASCADE;
TRUNCATE d3_logs CASCADE;
TRUNCATE k2_logs CASCADE;
TRUNCATE vitamin_c_logs CASCADE;
TRUNCATE zinc_logs CASCADE;
TRUNCATE magnesium_logs CASCADE;
TRUNCATE melatonin_logs CASCADE;
TRUNCATE caffeine_logs CASCADE;
TRUNCATE whoop_tokens CASCADE;
TRUNCATE whoop_data CASCADE;
TRUNCATE daily_summaries CASCADE;
```

### 2.2 Add user_id Column to Tables

**Tables that need `user_id`:**

```sql
-- Meals
ALTER TABLE meals ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE meals ALTER COLUMN user_id SET NOT NULL;

-- Food Logs
ALTER TABLE food_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE food_logs ALTER COLUMN user_id SET NOT NULL;

-- Exercise Logs
ALTER TABLE exercise_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE exercise_logs ALTER COLUMN user_id SET NOT NULL;

-- Treadmill Sessions
ALTER TABLE treadmill_sessions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE treadmill_sessions ALTER COLUMN user_id SET NOT NULL;

-- All Supplement Logs (8 tables)
ALTER TABLE creatine_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE creatine_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE d3_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE d3_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE k2_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE k2_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE vitamin_c_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE vitamin_c_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE zinc_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE zinc_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE magnesium_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE magnesium_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE melatonin_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE melatonin_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE caffeine_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE caffeine_logs ALTER COLUMN user_id SET NOT NULL;

-- Whoop Data
ALTER TABLE whoop_tokens ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE whoop_tokens ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE whoop_data ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE whoop_data ALTER COLUMN user_id SET NOT NULL;

-- Daily Summaries
ALTER TABLE daily_summaries ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE daily_summaries ALTER COLUMN user_id SET NOT NULL;
```

### 2.3 Update Unique Constraints
Some tables have unique constraints on `date` that now need to include `user_id`:

```sql
-- Drop old constraints and add new ones
ALTER TABLE creatine_logs DROP CONSTRAINT IF EXISTS creatine_logs_date_key;
ALTER TABLE creatine_logs ADD CONSTRAINT creatine_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE d3_logs DROP CONSTRAINT IF EXISTS d3_logs_date_key;
ALTER TABLE d3_logs ADD CONSTRAINT d3_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE k2_logs DROP CONSTRAINT IF EXISTS k2_logs_date_key;
ALTER TABLE k2_logs ADD CONSTRAINT k2_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE vitamin_c_logs DROP CONSTRAINT IF EXISTS vitamin_c_logs_date_key;
ALTER TABLE vitamin_c_logs ADD CONSTRAINT vitamin_c_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE zinc_logs DROP CONSTRAINT IF EXISTS zinc_logs_date_key;
ALTER TABLE zinc_logs ADD CONSTRAINT zinc_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE magnesium_logs DROP CONSTRAINT IF EXISTS magnesium_logs_date_key;
ALTER TABLE magnesium_logs ADD CONSTRAINT magnesium_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE melatonin_logs DROP CONSTRAINT IF EXISTS melatonin_logs_date_key;
ALTER TABLE melatonin_logs ADD CONSTRAINT melatonin_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE caffeine_logs DROP CONSTRAINT IF EXISTS caffeine_logs_date_key;
ALTER TABLE caffeine_logs ADD CONSTRAINT caffeine_logs_user_date_unique UNIQUE (user_id, date);

ALTER TABLE daily_summaries DROP CONSTRAINT IF EXISTS daily_summaries_date_key;
ALTER TABLE daily_summaries ADD CONSTRAINT daily_summaries_user_date_unique UNIQUE (user_id, date);

ALTER TABLE whoop_data DROP CONSTRAINT IF EXISTS whoop_data_date_key;
ALTER TABLE whoop_data ADD CONSTRAINT whoop_data_user_date_unique UNIQUE (user_id, date);
```

### 2.4 Create User Food Library Table

```sql
-- Personal food library (junction table)
CREATE TABLE user_food_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, food_id)
);

-- Index for fast lookups
CREATE INDEX idx_user_food_library_user ON user_food_library(user_id);
```

### 2.5 Tables That Stay Global (No user_id)
These are shared across all users:

| Table | Reason |
|-------|--------|
| `foods` | Global food cache from API |
| `exercises` | Shared exercise library |
| `exercise_sets` | Linked via exercise_logs.id (inherits user isolation) |

---

## Phase 3: Row Level Security (RLS)

### 3.1 Enable RLS on All User Tables

```sql
-- Enable RLS
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE treadmill_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE creatine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE d3_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE k2_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitamin_c_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zinc_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE magnesium_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE melatonin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE caffeine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whoop_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE whoop_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_food_library ENABLE ROW LEVEL SECURITY;
```

### 3.2 Create RLS Policies

**Template for user-owned tables:**
```sql
-- Policy template (repeat for each table)
CREATE POLICY "Users can view own data" ON [TABLE_NAME]
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data" ON [TABLE_NAME]
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data" ON [TABLE_NAME]
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own data" ON [TABLE_NAME]
  FOR DELETE USING (auth.uid() = user_id);
```

**Apply to all tables with user_id:**
```sql
-- Meals
CREATE POLICY "Users can view own meals" ON meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meals" ON meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meals" ON meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meals" ON meals FOR DELETE USING (auth.uid() = user_id);

-- Food Logs
CREATE POLICY "Users can view own food_logs" ON food_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own food_logs" ON food_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own food_logs" ON food_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own food_logs" ON food_logs FOR DELETE USING (auth.uid() = user_id);

-- Exercise Logs
CREATE POLICY "Users can view own exercise_logs" ON exercise_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exercise_logs" ON exercise_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercise_logs" ON exercise_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exercise_logs" ON exercise_logs FOR DELETE USING (auth.uid() = user_id);

-- Exercise Sets (linked via exercise_logs, need subquery)
CREATE POLICY "Users can view own exercise_sets" ON exercise_sets FOR SELECT
  USING (EXISTS (SELECT 1 FROM exercise_logs WHERE exercise_logs.id = exercise_sets.log_id AND exercise_logs.user_id = auth.uid()));
CREATE POLICY "Users can insert own exercise_sets" ON exercise_sets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM exercise_logs WHERE exercise_logs.id = exercise_sets.log_id AND exercise_logs.user_id = auth.uid()));
CREATE POLICY "Users can update own exercise_sets" ON exercise_sets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM exercise_logs WHERE exercise_logs.id = exercise_sets.log_id AND exercise_logs.user_id = auth.uid()));
CREATE POLICY "Users can delete own exercise_sets" ON exercise_sets FOR DELETE
  USING (EXISTS (SELECT 1 FROM exercise_logs WHERE exercise_logs.id = exercise_sets.log_id AND exercise_logs.user_id = auth.uid()));

-- Treadmill Sessions
CREATE POLICY "Users can view own treadmill_sessions" ON treadmill_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own treadmill_sessions" ON treadmill_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own treadmill_sessions" ON treadmill_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own treadmill_sessions" ON treadmill_sessions FOR DELETE USING (auth.uid() = user_id);

-- Creatine Logs
CREATE POLICY "Users can view own creatine_logs" ON creatine_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own creatine_logs" ON creatine_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own creatine_logs" ON creatine_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own creatine_logs" ON creatine_logs FOR DELETE USING (auth.uid() = user_id);

-- D3 Logs
CREATE POLICY "Users can view own d3_logs" ON d3_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own d3_logs" ON d3_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own d3_logs" ON d3_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own d3_logs" ON d3_logs FOR DELETE USING (auth.uid() = user_id);

-- K2 Logs
CREATE POLICY "Users can view own k2_logs" ON k2_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own k2_logs" ON k2_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own k2_logs" ON k2_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own k2_logs" ON k2_logs FOR DELETE USING (auth.uid() = user_id);

-- Vitamin C Logs
CREATE POLICY "Users can view own vitamin_c_logs" ON vitamin_c_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vitamin_c_logs" ON vitamin_c_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vitamin_c_logs" ON vitamin_c_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own vitamin_c_logs" ON vitamin_c_logs FOR DELETE USING (auth.uid() = user_id);

-- Zinc Logs
CREATE POLICY "Users can view own zinc_logs" ON zinc_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own zinc_logs" ON zinc_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own zinc_logs" ON zinc_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own zinc_logs" ON zinc_logs FOR DELETE USING (auth.uid() = user_id);

-- Magnesium Logs
CREATE POLICY "Users can view own magnesium_logs" ON magnesium_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own magnesium_logs" ON magnesium_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own magnesium_logs" ON magnesium_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own magnesium_logs" ON magnesium_logs FOR DELETE USING (auth.uid() = user_id);

-- Melatonin Logs
CREATE POLICY "Users can view own melatonin_logs" ON melatonin_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own melatonin_logs" ON melatonin_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own melatonin_logs" ON melatonin_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own melatonin_logs" ON melatonin_logs FOR DELETE USING (auth.uid() = user_id);

-- Caffeine Logs
CREATE POLICY "Users can view own caffeine_logs" ON caffeine_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own caffeine_logs" ON caffeine_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own caffeine_logs" ON caffeine_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own caffeine_logs" ON caffeine_logs FOR DELETE USING (auth.uid() = user_id);

-- Whoop Tokens
CREATE POLICY "Users can view own whoop_tokens" ON whoop_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own whoop_tokens" ON whoop_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own whoop_tokens" ON whoop_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own whoop_tokens" ON whoop_tokens FOR DELETE USING (auth.uid() = user_id);

-- Whoop Data
CREATE POLICY "Users can view own whoop_data" ON whoop_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own whoop_data" ON whoop_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own whoop_data" ON whoop_data FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own whoop_data" ON whoop_data FOR DELETE USING (auth.uid() = user_id);

-- Daily Summaries
CREATE POLICY "Users can view own daily_summaries" ON daily_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily_summaries" ON daily_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_summaries" ON daily_summaries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily_summaries" ON daily_summaries FOR DELETE USING (auth.uid() = user_id);

-- User Food Library
CREATE POLICY "Users can view own user_food_library" ON user_food_library FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own user_food_library" ON user_food_library FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own user_food_library" ON user_food_library FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own user_food_library" ON user_food_library FOR DELETE USING (auth.uid() = user_id);
```

### 3.3 Global Tables (Public Read Access)

```sql
-- Foods - anyone can read, anyone can insert (from API)
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view foods" ON foods FOR SELECT USING (true);
CREATE POLICY "Anyone can insert foods" ON foods FOR INSERT WITH CHECK (true);

-- Exercises - anyone can read, anyone can insert
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view exercises" ON exercises FOR SELECT USING (true);
CREATE POLICY "Anyone can insert exercises" ON exercises FOR INSERT WITH CHECK (true);
```

---

## Phase 4: Code Changes

### 4.1 Create Auth Context
**New file:** `src/contexts/auth-context.tsx`

```typescript
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

### 4.2 Create Auth Pages
**New files:**
- `src/app/(auth)/login/page.tsx` - Replace existing simple login
- `src/app/(auth)/signup/page.tsx` - New signup page

**Login page updates:**
- Email + password fields
- "Sign In" button
- Link to signup
- Error handling

**Signup page:**
- Email + password + confirm password
- "Sign Up" button
- Link to login
- Error handling

### 4.3 Update Proxy (Auth Check)
**File:** `src/proxy.ts`

Replace simple password check with Supabase session check:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // Create Supabase client for server
  const supabase = createServerClient(
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

  const { data: { session } } = await supabase.auth.getSession();

  // Public paths
  const publicPaths = ["/login", "/signup", "/api/auth"];
  const { pathname } = request.nextUrl;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Redirect to login if no session
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}
```

### 4.4 Update All Hooks to Include user_id
**Files to update:**
- `src/hooks/use-meals.ts`
- `src/hooks/use-food-logs.ts`
- `src/hooks/use-supplement.ts`
- `src/hooks/use-exercise-logs.ts`
- `src/hooks/use-treadmill.ts`
- `src/hooks/use-whoop-status.ts`
- `src/hooks/use-whoop-data.ts`
- `src/hooks/use-daily-summary.ts`

**Pattern for updates:**

Before:
```typescript
const { data } = await supabase
  .from("meals")
  .select("*")
  .eq("date", date);
```

After:
```typescript
const { data: { user } } = await supabase.auth.getUser();
const { data } = await supabase
  .from("meals")
  .select("*")
  .eq("date", date)
  .eq("user_id", user.id);
```

For inserts:
```typescript
const { data: { user } } = await supabase.auth.getUser();
const { data } = await supabase
  .from("meals")
  .insert({
    ...mealData,
    user_id: user.id,
  });
```

**Note:** With RLS enabled, the `user_id` filter is technically redundant for SELECT (RLS handles it), but explicit is better. For INSERT, you MUST provide user_id.

### 4.5 Update Daily Summary Aggregation
**File:** `src/lib/daily-summary/aggregate.ts`

Update to accept user_id parameter and include in all queries and the final save.

### 4.6 Update Cron Job
**File:** `src/app/api/cron/daily-sync/route.ts`

The cron job needs to sync for ALL users:
```typescript
// Fetch all users
const { data: users } = await supabase.auth.admin.listUsers();

// Sync for each user
for (const user of users) {
  await syncDailySummary(today, user.id);
}
```

**Note:** This requires service role key for admin access.

### 4.7 Add Supabase SSR Package
Need to install for server-side auth:
```bash
npm install @supabase/ssr
```

### 4.8 Update App Layout
**File:** `src/app/layout.tsx` or `src/app/page.tsx`

Wrap app with AuthProvider:
```typescript
<AuthProvider>
  <AppProvider>
    <DateProvider>
      {/* ... */}
    </DateProvider>
  </AppProvider>
</AuthProvider>
```

---

## Phase 5: Remove Old Auth System

### 5.1 Files to Delete
- `src/app/api/auth/login/route.ts` (old password check)
- `src/app/api/auth/logout/route.ts` (old cookie clear)

### 5.2 Environment Variables to Remove
- `APP_PASSWORD` (no longer needed)

### 5.3 Update Login Page
Replace the simple password form with email/password form that uses Supabase Auth.

---

## Phase 6: TypeScript Type Updates

### 6.1 Update Types
**File:** `src/lib/supabase/types.ts`

Add `user_id` to all relevant interfaces:
```typescript
export interface Meal {
  id: string;
  user_id: string;  // Add this
  date: string;
  name: string;
  // ...
}
```

### 6.2 New Types
```typescript
export interface UserFoodLibrary {
  id: string;
  user_id: string;
  food_id: string;
  added_at: string;
}
```

---

## Phase 7: UI Updates

### 7.1 Header Updates
- Add user email/avatar display
- Add "Sign Out" option in menu
- Remove "Sync Daily Summary" for cron (or keep as manual option)

### 7.2 New Pages
- `/signup` - Registration page
- Update `/login` - Now uses Supabase Auth

### 7.3 Protected Route Wrapper (Optional)
Create a component that redirects to login if not authenticated:
```typescript
function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Loading />;
  if (!user) redirect("/login");

  return children;
}
```

---

## Implementation Order (Recommended)

### Step 1: Database Setup
1. Run SQL to clear existing data
2. Run SQL to add user_id columns
3. Run SQL to update unique constraints
4. Run SQL to create user_food_library table
5. Run SQL to enable RLS
6. Run SQL to create all policies

### Step 2: Install Dependencies
```bash
npm install @supabase/ssr
```

### Step 3: Auth Infrastructure
1. Create `src/contexts/auth-context.tsx`
2. Update `src/app/layout.tsx` to include AuthProvider
3. Update `src/proxy.ts` for Supabase session check
4. Create new login page with Supabase Auth
5. Create signup page

### Step 4: Update Hooks (One by One)
1. `use-meals.ts`
2. `use-food-logs.ts`
3. `use-supplement.ts`
4. `use-exercise-logs.ts`
5. `use-treadmill.ts`
6. `use-whoop-status.ts`
7. `use-whoop-data.ts`
8. `use-daily-summary.ts`

### Step 5: Update API Routes
1. `src/lib/daily-summary/aggregate.ts`
2. `src/app/api/daily-summary/route.ts`
3. `src/app/api/cron/daily-sync/route.ts`
4. All Whoop API routes

### Step 6: Cleanup
1. Delete old auth routes
2. Remove APP_PASSWORD env var
3. Update header with sign out

### Step 7: Testing
1. Test signup flow
2. Test login flow
3. Test data isolation (create 2 accounts, verify data is separate)
4. Test all CRUD operations
5. Test daily sync

---

## Environment Variables Summary

### Keep
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- `WHOOP_REDIRECT_URI`
- `CRON_SECRET`

### Remove
- `APP_PASSWORD`

### Add (for cron admin access)
- `SUPABASE_SERVICE_ROLE_KEY` (from Supabase dashboard → Settings → API)

---

## Estimated Time

| Phase | Time |
|-------|------|
| Phase 1: Supabase Auth Setup | 15 min |
| Phase 2: Database Schema | 30 min |
| Phase 3: RLS Policies | 30 min |
| Phase 4: Code Changes | 2-3 hours |
| Phase 5: Remove Old Auth | 15 min |
| Phase 6: Type Updates | 30 min |
| Phase 7: UI Updates | 1 hour |
| Testing | 30 min |
| **Total** | **5-6 hours** |

---

## Rollback Plan
If something goes wrong:
1. Database: No rollback needed (data was wiped anyway)
2. Code: Git revert to previous commit
3. Vercel: Instant rollback to previous deployment
