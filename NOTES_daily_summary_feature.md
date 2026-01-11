# Daily Summary Feature - Implementation Notes

## Goal
Create a clean, aggregated data structure optimized for AI trend analysis. Currently data is scattered across many tables (meals, food_logs, supplements, exercise_logs, etc.). User wants everything for a given day collected into one record for easy analysis.

## Approach
**Option B: Keep both structures**
- Keep all current tables as-is (app UI continues working normally)
- Add a new `daily_summaries` table that pulls/aggregates everything into one nested record per day
- This creates some data duplication but is simpler to implement (no app rewrites)

## Desired Structure
Each row = one day. Nested structure inside:

```
Date: 2026-01-15
│
├── totals:                    ← Daily nutrition summary at top level
│   ├── calories
│   ├── protein
│   ├── fat
│   ├── carbs
│   └── vitamins (A, C, D, etc.)
│
├── meals:
│   ├── Meal 1:
│   │   ├── name, time
│   │   ├── foods: [each food with nutrition info]
│   │   └── meal_totals
│   ├── Meal 2: ...
│   └── Meal 3: ...
│
├── supplements:
│   ├── creatine: amount
│   ├── d3: amount
│   ├── k2: amount
│   ├── vitaminC: amount
│   ├── zinc: amount
│   ├── magnesium: amount
│   ├── melatonin: amount
│   └── caffeine: amount
│
├── workout:
│   ├── exercises: [each exercise with sets/reps/weight]
│   └── treadmill: [sessions with duration/incline/speed]
│
└── sleep/recovery: (from Whoop)
    ├── sleep duration, score
    ├── recovery score
    ├── HRV, RHR
    └── strain
```

## Implementation Tasks
1. Create `daily_summaries` table in Supabase with `date` and `data` (JSONB) columns
2. Build aggregation function that:
   - Queries all tables for a given date
   - Calculates daily nutrition totals
   - Assembles nested structure
   - Upserts into daily_summaries
3. Add trigger mechanism (button or automatic) to generate/update summaries

## Why This Structure
- One row per day = easy for AI to analyze trends
- All related data correlated by date
- Can export table and give directly to AI for pattern recognition
- Nested structure allows drilling into details while keeping overview clean
