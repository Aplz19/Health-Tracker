# Workout Session Update - Session-First Workflow

**Date**: January 28, 2026

## Overview

Restructured the workout tab to use a session-first workflow where users create workout sessions before adding exercises. This enables multiple workouts per day with proper grouping and Whoop workout linking.

## Key Changes

### User Experience

**Before**:
- Single workout session per day
- Exercises existed independently
- Confusing workflow for multiple daily workouts

**After**:
- Create multiple named workout sessions per day (e.g., "Morning Workout", "Evening Workout")
- Exercises are grouped within their sessions
- Each session can be independently linked to Whoop workouts
- Collapsible session cards for better organization

### New User Flow

1. Click "Add Workout" → creates new workout session with auto-suggested name
2. Add exercises within that specific workout session
3. Repeat for additional workouts on the same day
4. Link Whoop stats to specific workout sessions
5. Delete entire sessions (exercises cascade delete automatically)

## Technical Implementation

### Modified Files

1. **`src/hooks/use-workout-sessions.ts`**
   - Changed from single session to sessions array
   - All methods now accept `sessionId` parameter
   - Methods: `startSession()`, `linkWhoopWorkout()`, `unlinkWhoopWorkout()`, `deleteSession()`, `updateSessionNotes()`

2. **`src/components/tabs/workout-tab.tsx`**
   - Removed single SessionHeader
   - Added "Add Workout" button
   - Implemented exercise grouping by session_id
   - Renders WorkoutSessionCard components for each session
   - CardioSection remains unchanged at bottom

### New Components

1. **`src/components/workout/add-workout-dialog.tsx`**
   - Dialog for creating new workout sessions
   - Auto-suggests name based on time of day (Morning/Afternoon/Evening)
   - Sets start_time to current timestamp

2. **`src/components/workout/session-card-header.tsx`**
   - Collapsible header with expand/collapse toggle
   - Click-to-edit workout name
   - Displays time and Whoop metrics when linked
   - Dropdown menu for Link/Unlink Whoop and Delete actions

3. **`src/components/workout/workout-session-card.tsx`**
   - Collapsible card container for workout sessions
   - Shows session header, exercise list, and per-session "Add Exercise" button
   - Exercises only visible when expanded

### Database Migration

**File**: `sql/update_exercise_logs_cascade.sql`

Updated foreign key constraint on `exercise_logs.session_id` to use `ON DELETE CASCADE`. When a workout session is deleted, all associated exercises and their sets are automatically removed.

```sql
ALTER TABLE exercise_logs
ADD CONSTRAINT exercise_logs_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES workout_sessions(id)
ON DELETE CASCADE;
```

**⚠️ Action Required**: Run this migration on production database before deploying.

## UI Layout

```
┌────────────────────────────────┐
│ [+ Add Workout]                │ ← Create new session
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │ ▾ Morning Workout • 9:30 AM│ │ ← Expanded session
│ │ [Whoop metrics if linked]  │ │
│ ├────────────────────────────┤ │
│ │  Exercise 1 (sets)         │ │
│ │  Exercise 2 (sets)         │ │
│ │  [+ Add Exercise]          │ │ ← Per-session
│ └────────────────────────────┘ │
│                                │
│ ┌────────────────────────────┐ │
│ │ ▸ Evening Workout • 6:00 PM│ │ ← Collapsed session
│ └────────────────────────────┘ │
│                                │
│ [Cardio Section]               │ ← Unchanged
└────────────────────────────────┘
```

## Breaking Changes

None - this is a backward-compatible enhancement. Existing exercise logs without session_id will continue to work.

## Known Limitations

- No support for moving exercises between sessions (v1)
- Exercises must be deleted and re-added to change sessions
- Session names are stored in the `notes` field

## Dependencies Added

- `@dnd-kit/modifiers` - Fixed pre-existing missing dependency

## Testing Checklist

- [ ] Create multiple workouts in same day
- [ ] Add exercises to different sessions
- [ ] Verify exercise grouping is correct
- [ ] Collapse/expand sessions
- [ ] Link Whoop workout to specific session
- [ ] Verify Whoop metrics show only on linked session
- [ ] Delete session and verify exercises cascade delete
- [ ] Edit session name
- [ ] Verify persistence across page navigation
- [ ] Test mobile responsiveness

## Migration Steps

1. Install dependencies: `npm install`
2. Run database migration: `sql/update_exercise_logs_cascade.sql`
3. Build and test: `npm run build && npm run dev`
4. Deploy to production

## Future Enhancements

- Drag-and-drop to reorder sessions
- Move exercises between sessions
- Session templates (save common workout structures)
- Session duration tracking (separate from Whoop data)
- Session notes/comments field
