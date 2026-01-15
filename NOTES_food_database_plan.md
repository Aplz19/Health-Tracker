# Food Database Integration Plan

## Goal
Enable searching for foods from a large database instead of manually entering all nutrition data.

---

## Available Free Databases

| Database | Description | Pros | Cons |
|----------|-------------|------|------|
| **USDA FoodData Central** | US government nutrition database | Free, no API key, government-verified, 1000 req/hour | US foods only, no branded items |
| **Open Food Facts** | Open source, crowd-sourced | Free, 2.8M+ products, barcodes/branded items | Inconsistent data quality |

### USDA FoodData Central
- URL: https://fdc.nal.usda.gov/
- API Docs: https://fdc.nal.usda.gov/api-guide/
- Rate limit: 1000 requests/hour per IP
- No API key required
- Public domain data (CC0)

### Open Food Facts
- URL: https://world.openfoodfacts.org/
- API Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
- No rate limits mentioned
- Supports barcode lookup

---

## Storage Options Considered

### Comparison Table

| Option | Storage Cost | Speed | Complexity | Offline | Always Current |
|--------|--------------|-------|------------|---------|----------------|
| A: Download All | High (GB+) | Fast | High | Yes | No (quarterly updates) |
| B: API Only | None | Slow | Low | No | Yes |
| C: Hybrid | Low (grows over time) | Fast for saved foods | Medium | Partial | Yes for new foods |
| D: Common Subset | Medium (~5-10k foods) | Fast | Medium | Mostly | No |

---

### Option A: Download Entire Database
**Description:** Download all ~400,000+ foods from USDA into Supabase

**Pros:**
- Fastest searches (all local)
- No rate limits
- Works fully offline
- No external API dependency

**Cons:**
- Several GB of storage needed
- Need to handle quarterly USDA updates
- Complex initial setup
- Storage costs in Supabase

---

### Option B: Query API Each Time
**Description:** Always search the external API, never store foods locally

**Pros:**
- Zero storage cost
- Always up-to-date data
- Simplest to implement

**Cons:**
- Rate limited (1000 requests/hour USDA)
- Slower (network latency on every search)
- Doesn't work offline
- Dependent on external service availability

---

### Option C: Hybrid (Recommended)
**Description:** Query API for new foods, save selected foods to local database

**Pros:**
- Personal library builds naturally with foods you actually eat
- Fast for frequently eaten foods (local)
- No massive database to maintain
- Low storage cost (only stores what you use)
- API only needed occasionally for new foods

**Cons:**
- First search for a food requires API call
- Slightly more complex than Option B

**How it works:**
1. User searches for food
2. Check local `foods` table first
3. If not found, query external API
4. User selects a food from results
5. Save to local `foods` table
6. Next time → found locally, no API needed

---

### Option D: Download Common Subset
**Description:** Pre-download 5,000-10,000 most common foods, use API for rest

**Pros:**
- Most searches are local and fast
- Manageable storage size
- Works offline for common foods

**Cons:**
- Need to decide which foods to include
- Still need API for uncommon/branded items
- Need periodic updates for the subset

---

## Multi-User Architecture: Two-Tier System

### Overview
With multiple users, we need to separate the **global food cache** from **personal food libraries**.

### Database Structure

| Table | Purpose |
|-------|---------|
| `foods` | Global cache - ALL foods ever fetched from API (shared across all users) |
| `user_food_library` | Personal libraries - links users to their favorite foods |

**`user_food_library` junction table:**
```
user_id | food_id | added_at
```

### Why Two Tiers?

- **Global cache:** Prevents redundant API calls. If User A searched "chicken breast", User B doesn't need to hit the API again.
- **Personal library:** Each user's curated list of their commonly eaten foods. Keeps their UI clean with only foods they want quick access to.

### Flow Example

```
User A searches "chicken breast"
  → Check User A's personal library → not found
  → Check global food cache → not found
  → Query USDA API → found
  → Save to global cache (for future users)
  → User A adds to their personal library

User B searches "chicken breast"
  → Check User B's personal library → not found
  → Check global food cache → FOUND (from User A)
  → No API call needed!
  → User B can add to their personal library if they want
```

---

## Separate Actions: Add to Meal vs Save to Library

### Key Concept
Adding a food to a meal should NOT automatically save it to the user's personal library. These are two independent actions.

### Actions Defined

| Action | What it does |
|--------|--------------|
| **Add to Meal** | Logs the food to your meal for that day only |
| **Save to Library** | Explicitly saves to your personal food library for quick access later |

### Flow for One-Off Food (e.g., Poptart)

```
User searches "poptart"
  → Check global cache → not found
  → Query API → found
  → Save to GLOBAL cache (always - saves API calls for others)
  → User clicks "Add to Meal" (logged for today)
  → NOT added to personal library (unless they explicitly save it)
```

### What Gets Saved Where

| Action | Global Cache | Personal Library | Meal Log |
|--------|--------------|------------------|----------|
| Search from API | ✅ Always saved | ❌ No | ❌ No |
| Add to meal | Already there | ❌ No | ✅ Yes |
| Save to library | Already there | ✅ Yes | - |

### UI Options

When selecting a food from search results:
- **"Add to Meal"** button - just logs it to current meal
- **Star icon or "Save to Library"** button - saves to personal favorites

Or after adding to meal, show a small prompt: "Save to your food library?" [Yes] [No]

### Benefits
- Personal library stays clean with only foods user actually wants
- One-off foods don't clutter personal library
- Global cache grows to reduce API calls for all users
- Users have full control over their personal library

---

## Recommended Approach: Hybrid (Option C)

### How It Would Work
1. User goes to add food to a meal
2. Search box queries USDA/Open Food Facts API
3. Results displayed with nutrition info
4. User selects a food
5. Food is saved to local `foods` table (if not already there)
6. Food is added to their meal log
7. Next time they search, local foods appear first, then API results

### Benefits
- No massive database to maintain
- Personal library grows with actual eating habits
- Fast for frequently eaten foods
- API only needed for new foods

---

## Implementation Tasks (Future)
1. Add USDA API integration (`src/lib/usda/client.ts`)
2. Optionally add Open Food Facts for branded items
3. Update food search UI to query API
4. Auto-save selected API foods to local `foods` table
5. Show local foods first in search results, then API results

---

## MyFitnessPal Note
MyFitnessPal shut down their public API years ago - cannot access their database directly.
