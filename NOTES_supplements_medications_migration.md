# Supplements → tracked items, + Medications

**Plan written 2026-08-06.** Status is updated at the bottom as work lands.

## Why

Supplements are **15 hardcoded definitions with one table each** (`creatine_logs`,
`d3_logs`, `k2_logs`, …). Adding a supplement means a new table, a new
migration, a new hook call and a new entry in a hardcoded list. It's also why
the analytics fix had to enumerate 15 tables by hand.

Habits v2 already proved the better shape: user-created rows in one table plus
one generic log table. Supplements should converge on it, and **medications**
then become a category within that system rather than a second subsystem.

The trigger: starting bupropion HCl SR 100 mg (once daily, mornings, first dose
2026-07-28). Medication is the highest-value thing this app can record, because
it marks a **regime boundary** that every future analysis has to respect.

## The invariant that must survive (most important thing in this doc)

> **A log row stores the amount actually taken on that date. Nothing ever
> recomputes a historical amount from current settings.**

This is what makes the "no manual start dates" design correct — see below. It
already holds today (`updateAmount` writes a literal amount to a dated row;
changing a goal only touches `user_supplement_preferences`), and it was verified
against real data:

```sql
SELECT amount, count(*) AS days, min(date) AS first_day, max(date) AS last_day
FROM d3_logs GROUP BY amount ORDER BY first_day;
```

```
amount | days | first_day  | last_day
     0 |    3 | 2026-01-12 | 2026-07-17
  5000 |   23 | 2026-01-18 | 2026-06-28
 10000 |   13 | 2026-06-30 | 2026-08-04
```

The D3 goal was raised 5000 → 10000 in late June and **history was not
rewritten**. That output is also the point: the logs already *are* the dose
history.

## Design decisions

1. **No manual start dates or dose-period rows.** Start date = first day with a
   non-zero amount; a dose change = the day the logged amount changes. Declaring
   it separately would create a second source of truth that can silently
   disagree with the logs. One-off context ("started bupropion today") belongs
   in the day note.
2. **`is_enabled` carries "am I currently taking this".** Without it, a missed
   dose is indistinguishable from having stopped:
   - enabled + logged → taken
   - enabled + not logged → **missed** (must be visible in analysis)
   - disabled → not currently taking
3. **Disabling never deletes history.** Coming off a medication hides it from
   today's list; every day it was taken stays in the data permanently.
4. **Medications get their own section, same engine.** One table with a `kind`
   discriminator (`supplement` | `medication`), two UI sections. Medications add
   dose strength and doses/day; supplements don't need them.
5. **Dosing model stays deliberately small.** `dose_amount` (strength per dose)
   × `doses_per_day`. That covers every daily medication including this one.
   As-needed = `doses_per_day = 0`. No taper/PRN/with-food modelling.
6. **Daily interaction is a checkbox** (N checkboxes when `doses_per_day` is N).
   The amount is derived from the item's configured dose and snapshotted into
   the log row — never typed again after setup.

## Bug being fixed on the way

`GoalSupplementRow` decides checked state with `amount >= goalAmount`, comparing
an **old day's** amount against the **current** goal. After raising the D3 goal
to 10000, all 23 days logged at 5000 render as unchecked — as if skipped. The
data is fine; the display lies retroactively. A day counts as taken if something
was logged, not by comparison against today's target.

## Plan

### 1. Schema (`sql/add_tracked_items.sql`) — additive, run manually
- `user_tracked_items` — id, user_id, kind, name, unit, dose_amount,
  doses_per_day, is_enabled, tracking_mode, goal_amount, sort_order,
  legacy_key, timestamps. Unique on (user_id, kind, name).
- `tracked_item_logs` — item_id, user_id, date, amount, doses_taken.
  Unique on (item_id, date).
- RLS + per-user policies on both.
- Backfill: for each of the 15 legacy tables, create an item per user (carrying
  their existing preference: enabled, tracking mode, goal, sort order) and copy
  every log row across, preserving date and amount.
- **Nothing is dropped.** The 15 legacy tables stay exactly as they are.

### 2. Verification (run before trusting it)
Row counts per supplement, old vs new, plus first/last day and distinct amounts.
The migration is only "done" when those match.

### 3. Code
- `use-tracked-items` replaces `useSupplement` ×15 and `useSupplementPreferences`.
- Dietary tab: supplements rendered from items; new **Medications** section.
- Settings: create/enable/disable/reorder items, including custom ones.
- Daily summary + analytics read the new tables.

### 4. Only after all of the above is confirmed working
Drop the legacy tables — and not immediately; there is no cost to keeping them.

## Status

- 2026-08-06 — plan written. Implementation follows below.
