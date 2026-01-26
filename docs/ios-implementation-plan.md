# iOS Implementation Plan (Health Tracker)

## Context: Current Web App Surface Area
- **Entry + authentication:** The app uses a Next.js `app` router with client-side Supabase auth and username-to-email conversion on the login/signup pages. The home page mounts multiple providers before rendering the main app shell. The auth context drives onboarding state. 
- **Navigation:** The core experience is a 5-tab layout (Dietary, Workout, Habits, Whoop, Analytics) with a header and a tab bar rendered in the web UI. 
- **Overlays and onboarding:** The app uses full-screen overlays for Food/Exercise/Supplement libraries and a multi-step onboarding flow (Whoop, Supplements, Habits). 
- **Data entry + logging:** Meals, food logs, supplements, habits, workouts, and cardio sessions are managed via client hooks that directly query Supabase tables.
- **Whoop integration:** OAuth is handled via Next.js API routes, storing tokens in Supabase and syncing Whoop data into a `whoop_data` table. 
- **Barcode scanning:** Barcode scanning uses the browser camera and Quagga, then calls a Next.js API route for OpenFoodFacts lookup.
- **Analytics:** The analytics screen aggregates nutrition, whoop, supplement, and exercise data from Supabase and visualizes it with Recharts.

## What Still Needs to Be Created for iOS
### 1) Mobile App Foundation
- **Native app shell:** A React Native (Expo) app does not exist yet. The full iOS app shell, navigation, and screen hierarchy must be created.
- **Routing and navigation:** Replace the web tab system with React Navigation (stack + tab + modal). 

### 2) Shared Logic Extraction
- **Shared package:** Core domain logic is currently in web hooks and components. A shared package (e.g., `packages/shared`) must be created to reuse data models, validation, and calculations across web + mobile.

### 3) Mobile-Safe Supabase + Auth
- **Supabase client:** The web client uses `createBrowserClient`; iOS needs the React Native Supabase client with secure token storage.
- **Auth flows:** The app uses cookie-based sessions in Next.js routes for Whoop; mobile needs token-based auth and refresh handling.

### 4) Whoop OAuth + Deep Linking
- **Mobile OAuth flow:** Update Whoop redirect URIs and use app deep links/universal links to complete the flow.
- **Token storage:** Use Keychain/SecureStore for tokens in mobile.

### 5) Device Features
- **Barcode scanning:** Replace Quagga (web) with native camera scanning (e.g., `expo-barcode-scanner` or `react-native-vision-camera`).

### 6) Analytics + Charts
- **Charting library:** Recharts is web-only. Replace with a mobile chart library (e.g., victory-native, react-native-svg-charts).

### 7) Settings + Preferences
- **Preferences UI:** Habits/supplements preferences and overlays need a mobile-friendly settings surface (likely a dedicated Settings tab or modal).

### 8) Backend and API Strategy
- **API routes:** Existing Next.js API routes must be accessible to mobile or migrated to a standalone API service. Ensure auth works with bearer tokens.
- **Cron jobs:** The daily summary cron currently lives in Next.js API routes and should be moved to a backend or serverless schedule accessible outside the web app.

### 9) App Config + Distribution
- **Mobile config:** iOS app ID, icons, splash screens, permissions, and environment separation are required.
- **Release pipeline:** EAS build/TestFlight process must be defined.

## Implementation Plan & Architecture (In-Depth)

### A) Repo Structure & Shared Packages
**Recommended structure:**
- `apps/web` (current Next.js app)
- `apps/mobile` (Expo app)
- `packages/shared` (types, domain models, API clients, validation)

**Shared package contents:**
- TypeScript domain types for meals, foods, exercise logs, habits, supplements, Whoop data.
- Data transformation utilities (nutrition aggregates, analytics stats, date handling).
- API client wrappers for Supabase and backend services.

**Migration steps:**
1. Move pure functions and TypeScript types from `src/lib`, `src/types`, and hook helpers into `packages/shared`.
2. Update both web and mobile to consume shared types.

### B) Mobile App Navigation + Screen Mapping
**Navigation stack:**
- **Root:** Auth stack (Login/Signup) and App stack.
- **App stack:** Bottom tabs for Dietary, Workout, Habits, Whoop, Analytics.
- **Modals:** Food/Exercise/Supplement library overlays become modal screens.
- **Onboarding:** Use a stack flow with persistent progress indicator.

**Screen mapping:**
- Dietary → meal list, nutrition summary, supplements.
- Workout → strength + cardio sessions.
- Habits → daily habit tracker.
- Whoop → connection state + recovery/sleep/strain cards.
- Analytics → summary cards + metric detail sheet.

### C) Data Layer & Offline Strategy
**Supabase client in mobile:**
- Use `@supabase/supabase-js` with React Native storage.
- Store auth tokens in SecureStore (Expo) or Keychain.

**Offline support (recommended):**
- Cache daily logs locally (SQLite/WatermelonDB) for offline logging.
- Queue writes and sync when online.

### D) Auth, Session, and Security
**Mobile auth approach:**
- Use Supabase Auth with PKCE.
- Handle refresh tokens and session persistence in SecureStore.

**Security:**
- Never embed service role keys in mobile.
- Use backend APIs for privileged operations.

### E) Whoop Integration
**OAuth flow:**
- Start OAuth from mobile → open web auth in SFSafariViewController.
- Redirect back via universal link or custom URL scheme.
- Backend handles code exchange and stores tokens.

**Data sync:**
- Mobile triggers `/api/whoop/sync` (or mobile backend equivalent) to refresh Whoop data.
- Cache data locally to reduce API calls.

### F) Food Logging + Barcode Scanning
**Barcode scanning:**
- Implement with `expo-barcode-scanner` or `react-native-vision-camera`.
- Reuse OpenFoodFacts lookup logic via backend API or shared client.

**Food library + search:**
- Build mobile search UI with debounced API calls.
- Allow custom foods and shared global library.

### G) Workout & Cardio Logging
**Strength logging:**
- Mirror sets/weights/notes UI with mobile-friendly inputs and sliders.

**Cardio logging:**
- Maintain cardio sessions as a dedicated component with time/distance/pace input.

### H) Habits + Supplements
**Habits:**
- Support checkbox, goal, and manual modes.
- Provide a settings screen to configure tracked habits.

**Supplements:**
- Support daily and ad-hoc supplements.
- Provide a supplement library management UI.

### I) Analytics & Visualization
**Metrics:**
- Recreate analytics cards with a mobile charting library.
- Provide drill-down detail screen for each metric (range toggle, stats, trend).

### J) Backend + Cron
**Backend options:**
- Keep Next.js API routes and expose them to mobile, or
- Move Whoop + daily summary + barcode lookup to a standalone API (e.g., Node/Express or Supabase Edge Functions).

**Cron:**
- Move daily summary sync to a scheduled job outside Next.js.

### K) Build, Release, and QA
**Build:**
- Use EAS for iOS builds + TestFlight.
- Configure environment variables for dev/stage/prod.

**Testing:**
- Unit tests for shared logic.
- Detox or Playwright (via Expo) for E2E flows.
- Manual QA for camera, auth, deep links, and offline sync.

## Appendix: Discovery Commands
- `rg -n "iOS|ios|React Native|Swift|mobile" -S README.md docs src`
- `find src/app -maxdepth 2 -type d`
- `find src/app/api -maxdepth 3 -type f`
- `rg -n "barcode" src/components/food src/hooks -S`
