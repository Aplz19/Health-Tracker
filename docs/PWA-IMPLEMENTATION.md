# PWA (Progressive Web App) Implementation

## Overview

This document explains the PWA setup added to Health Tracker in commit `477c43a`.

## What Was Added

### Files Created
- `public/manifest.json` — Web app manifest defining app name, colors, icons
- `public/sw.js` — Service worker for caching static assets
- `src/components/pwa-register.tsx` — Client component that registers the service worker
- `scripts/generate-icons.js` — Script to generate placeholder PNG icons

### Files Modified
- `src/app/layout.tsx` — Added PWA metadata (manifest link, apple-web-app tags, viewport settings)
- `package.json` — Added `generate-icons` script

## How It Works

### Service Worker Caching Strategy

The service worker (`public/sw.js`) implements two caching strategies:

1. **Cache-first for static assets** (JS, CSS, images):
   - Checks cache first, returns cached version immediately
   - Fetches fresh version in background and updates cache
   - Result: Near-instant loading on repeat visits

2. **Network-first for API calls** (Supabase, `/api/*` routes):
   - Always fetches fresh data from network
   - Falls back to cache only if network fails
   - Result: Data stays fresh, but works offline with stale data

### Manifest Configuration

```json
{
  "name": "Health Tracker",
  "short_name": "Health",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000"
}
```

- `display: standalone` — Removes browser UI when launched from home screen
- Dark theme colors match the app's dark mode

## Why It's More Efficient

### Before (Browser Bookmark)
1. User taps bookmark
2. Safari opens
3. Full network request for HTML
4. Full network request for JS bundles
5. Full network request for CSS
6. Full network request for fonts
7. App renders

Every visit = full download of everything.

### After (PWA)
1. User taps app icon
2. App opens in standalone mode (no Safari UI)
3. Service worker intercepts requests
4. HTML/JS/CSS/fonts served from cache (instant)
5. Only Supabase data fetched from network
6. App renders

Repeat visits = only data is fetched, everything else is cached locally.

### Performance Difference
- First visit: Same as before (must download and cache)
- Repeat visits: Significantly faster (assets load from disk, not network)
- Offline: App shell loads, shows cached data (if any)

## iOS-Specific Behavior

### What Changes for iOS Users

1. **Standalone Mode**: When added to home screen and launched, the app opens WITHOUT Safari's address bar, tabs, or navigation buttons. It looks and feels like a native app.

2. **Status Bar**: The `apple-mobile-web-app-status-bar-style: black-translucent` setting makes the status bar blend with the app's dark background.

3. **Home Screen Icon**: iOS uses the `apple-touch-icon.png` (180x180) for the home screen icon. Without this file, iOS will use a screenshot of the page.

4. **No Browser Chrome**: The viewport settings disable pinch-to-zoom and set proper scaling for a native feel:
   ```typescript
   maximumScale: 1,
   userScalable: false,
   ```

5. **App Title**: When users add to home screen, it will default to "Health Tracker" instead of the page title.

### iOS Limitations
- Push notifications require extra setup (and iOS 16.4+)
- iOS may clear cached data if the PWA isn't used for several weeks
- Some web APIs are restricted compared to Android PWAs

## What Still Needs To Be Done

### Icons (Required)

The icon files don't exist yet. Without them:
- Home screen will show a generic icon or page screenshot
- Manifest validation will show warnings

**To generate icons:**

1. Install Node.js from https://nodejs.org (LTS version)
2. Run:
   ```bash
   npm run generate-icons
   ```
3. This creates:
   - `public/icon-192.png` (192x192) — Android/general use
   - `public/icon-512.png` (512x512) — Android splash/install
   - `public/apple-touch-icon.png` (180x180) — iOS home screen

4. Commit and push:
   ```bash
   git add public/*.png
   git commit -m "Add PWA icons"
   git push
   ```

**Alternative:** Replace placeholder icons with a real logo:
- Create your own 512x512 PNG with transparent or dark background
- Use a tool like https://realfavicongenerator.net to generate all sizes
- Place files in `public/` folder

### Optional Enhancements

1. **Splash screens for iOS**: Add `apple-touch-startup-image` links for various device sizes
2. **Offline page**: Create a dedicated offline fallback page
3. **Cache versioning**: Update `CACHE_NAME` in `sw.js` when deploying breaking changes

## Testing the PWA

### Desktop (Chrome DevTools)
1. Open DevTools → Application tab
2. Check "Manifest" section — should show app info
3. Check "Service Workers" section — should show `sw.js` registered
4. Run Lighthouse → PWA audit

### iOS
1. Open site in Safari
2. Tap Share button → "Add to Home Screen"
3. Launch from home screen
4. Verify: No Safari UI, loads quickly on repeat opens

### Clearing Cache (if needed)
Users can clear PWA cache by:
- iOS: Delete the app from home screen, re-add it
- Update `CACHE_NAME` in `sw.js` to force cache refresh on next deploy

## File Reference

| File | Purpose |
|------|---------|
| `public/manifest.json` | PWA metadata for browsers |
| `public/sw.js` | Service worker (caching logic) |
| `src/components/pwa-register.tsx` | Registers SW on app load |
| `src/app/layout.tsx` | Contains PWA metadata exports |
| `scripts/generate-icons.js` | Generates placeholder icons |
