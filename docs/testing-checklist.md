# Manual Testing Checklist (Multi-User Transition)

Use this checklist when validating the multi-user auth and data isolation flow.

## Auth
- Sign up with a new username/password (expect redirect into app).
- Log out from the header.
- Log in again with the same credentials.

## Data Isolation
- Create Account A and log a meal/food/workout.
- Create Account B and verify it does **not** see Account A data.
- Switch back to Account A and verify its data remains intact.

## CRUD Coverage
- Meals: add/update/delete meals.
- Food logs: add/update/delete food entries.
- Supplements: adjust daily supplements and verify persistence.
- Habits: toggle/update habits and verify persistence.
- Workouts: add/update/delete exercises and sets.
- Cardio: add/update/delete treadmill sessions.

## Daily Summary Sync
- Run daily summary sync from the header.
- Verify a row is created/updated in `daily_summaries` for the current user and date.
