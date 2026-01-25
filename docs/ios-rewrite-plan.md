# iOS Rewrite Plan (Health Tracker)

## Goal
Create a dedicated iOS app version of the Health Tracker by rewriting the current Next.js web app into a mobile-native experience, while preserving core business logic and backend integrations.

## Recommended Tech Stack
- **UI framework:** React Native + Expo (aligns with the existing React/TypeScript codebase).
- **Navigation:** React Navigation (stack + tabs).
- **State management:** Reuse existing React contexts where feasible; migrate any browser-dependent logic.
- **Backend:** Keep Next.js API routes deployed as a separate web service **or** migrate to a standalone API layer (e.g., Node/Express or Supabase Edge Functions).
- **Shared logic:** Extract cross-platform business logic into a shared package (e.g., `packages/shared`).

## Execution Plan
1. **Decide repo structure**
   - Option A: Monorepo (`apps/web`, `apps/mobile`, `packages/shared`).
   - Option B: Separate repo for iOS app with a shared package as a git submodule or published package.

2. **Inventory current functionality**
   - Catalog pages, API routes, contexts, and data flows.
   - Identify all browser-only dependencies (charts, barcode scanning, drag-and-drop).

3. **Extract shared domain logic**
   - Move non-UI logic from `src/lib`, `src/contexts`, and `src/hooks` into a shared package.
   - Create interfaces for services (e.g., `HealthApi`, `WhoopService`, `FoodLookupService`).

4. **Back-end strategy**
   - Keep current Next.js API routes running separately **or**
   - Migrate to a standalone backend that supports the mobile app.

5. **Rebuild UI in React Native**
   - Replace all Next.js pages with React Native screens.
   - Recreate layouts and flows using RN components (views, stacks, lists).
   - Replace web-specific UI libraries with mobile equivalents.

6. **Auth & deep links**
   - Update OAuth flows (Whoop) to use mobile redirect URIs.
   - Configure deep links / universal links in iOS.

7. **Device features**
   - Replace browser-based barcode scanning with native camera modules.
   - Ensure permissions and device-specific handling (camera, notifications).

8. **Testing & QA**
   - Unit tests for shared logic.
   - E2E testing using Detox or Expo EAS.
   - iOS TestFlight rollout for feedback.

## Required Changes (Detailed)

### 1) UI & Navigation
- **Rewrite all Next.js pages** as React Native screens.
- Replace Next.js routing with **React Navigation**.
- Adapt layout components to RN (`View`, `ScrollView`, `SafeAreaView`).

### 2) Component Libraries
- Replace Radix UI with a mobile UI kit (e.g., React Native Paper).
- Replace Recharts with a mobile charting library (e.g., `victory-native`).
- Replace web drag-and-drop with RN equivalents (e.g., `react-native-draggable-flatlist`).

### 3) Barcode Scanning
- Replace `html5-qrcode` / `quagga2` with:
  - `expo-barcode-scanner`, `expo-camera`, or `react-native-vision-camera`.

### 4) Backend / API
- Next.js API routes must be deployed or migrated to a standalone API.
- Update endpoints to accept mobile client calls.
- Ensure CORS and auth flows are compatible with mobile.

### 5) Supabase
- Replace `createBrowserClient` usage with mobile-safe Supabase client.
- Ensure server-side keys stay on backend only.
- Use token-based auth flows for mobile.

### 6) OAuth / External Services
- Update Whoop OAuth redirect to use mobile URIs.
- Store tokens securely using Keychain/SecureStore on iOS.

### 7) Environment & Config
- Add iOS app config with Expo or React Native CLI.
- Separate `.env` for web vs. mobile.

### 8) Assets & Icons
- Create iOS app icons and splash screens.
- Update build pipeline to generate iOS assets.

## Deliverables
- `apps/mobile` (React Native app)
- `packages/shared` (shared logic)
- Updated backend deployment to support mobile
- Documentation for local development and release

