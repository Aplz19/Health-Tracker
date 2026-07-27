"use client";

import { useState, useMemo } from "react";
import { Dumbbell, Plus, Trash2, MessageSquare } from "lucide-react";
import { useDate } from "@/contexts/date-context";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExerciseLogs } from "@/hooks/use-exercise-logs";
import {
  useLastExercisePerformance,
  getReferenceSet,
  type LastSetPerformance,
} from "@/hooks/use-last-exercise-performance";
import { useTreadmill } from "@/hooks/use-treadmill";
import { useWorkoutSessions } from "@/hooks/use-workout-sessions";
import { ExercisePickerDialog } from "@/components/exercise/exercise-picker-dialog";
import { CardioSection } from "@/components/workout/cardio-section";
import { AddWorkoutDialog } from "@/components/workout/add-workout-dialog";
import { WorkoutSessionCard } from "@/components/workout/workout-session-card";
import { CATEGORY_LABELS } from "@/lib/exercise-categories";
import type { ExerciseLogWithDetails, ExerciseSetWithDetails } from "@/hooks/use-exercise-logs";
import type { CardioExerciseType } from "@/lib/supabase/types";

// Individual set row component
function SetRow({
  set,
  label,
  lastSet,
  onUpdate,
  onDelete,
}: {
  set: ExerciseSetWithDetails;
  /** "W1" for warm-ups, "1".."n" for working sets — numbered independently. */
  label: string;
  /** Same-position set from the last session, shown as ghost text. */
  lastSet: LastSetPerformance | null;
  onUpdate: (updates: { is_warmup?: boolean; reps?: number | null; weight?: number | null; notes?: string | null }) => void;
  onDelete: () => void;
}) {
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [weight, setWeight] = useState(set.weight?.toString() ?? "");
  const [showNotes, setShowNotes] = useState(!!set.notes);
  const [notes, setNotes] = useState(set.notes ?? "");

  const handleRepsBlur = () => {
    const newReps = reps ? parseInt(reps) : null;
    if (newReps !== set.reps) {
      onUpdate({ reps: newReps });
    }
  };

  const handleWeightBlur = () => {
    const newWeight = weight ? parseFloat(weight) : null;
    if (newWeight !== set.weight) {
      onUpdate({ weight: newWeight });
    }
  };

  const handleNotesBlur = () => {
    if (notes !== set.notes) {
      onUpdate({ notes: notes || null });
    }
  };

  const toggleWarmup = () => {
    onUpdate({ is_warmup: !set.is_warmup });
  };

  // Double-tap a field to carry last session's number forward — most weeks
  // are the same weight and reps, so this is the common case.
  const fillWeightFromLast = () => {
    if (lastSet?.weight == null) return;
    const value = lastSet.weight.toString();
    setWeight(value);
    if (lastSet.weight !== set.weight) onUpdate({ weight: lastSet.weight });
  };

  const fillRepsFromLast = () => {
    if (lastSet?.reps == null) return;
    const value = lastSet.reps.toString();
    setReps(value);
    if (lastSet.reps !== set.reps) onUpdate({ reps: lastSet.reps });
  };

  return (
    <div className={`space-y-1 ${set.is_warmup ? "opacity-75" : ""}`}>
      <div className="flex items-center gap-2">
        {/* Set label & warm-up toggle. Warm-ups are amber "W1"; working sets
            are numbered independently so the first working set always reads
            "1" even after warm-ups. */}
        <button
          onClick={toggleWarmup}
          className={`w-9 h-8 shrink-0 rounded text-xs font-semibold flex items-center justify-center transition-colors ${
            set.is_warmup
              ? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
              : "bg-primary/20 text-primary border border-primary/30"
          }`}
          aria-label={
            set.is_warmup
              ? `Warm-up set ${label}. Tap to make it a working set.`
              : `Working set ${label}. Tap to make it a warm-up.`
          }
          title={set.is_warmup ? "Warm-up set — tap to make working" : "Working set — tap to make warm-up"}
        >
          {label}
        </button>

        {/* Weight input (before reps: you pick the weight, then see how many
            you get) — ghost text is last session's weight. */}
        <div className="flex-1">
          <Input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={handleWeightBlur}
            onDoubleClick={fillWeightFromLast}
            placeholder={lastSet?.weight != null ? lastSet.weight.toString() : "lbs"}
            className="h-8 text-center text-sm"
            min={0}
            step={2.5}
          />
        </div>

        {/* Reps input — ghost text is last session's reps. */}
        <div className="flex-1">
          <Input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={handleRepsBlur}
            onDoubleClick={fillRepsFromLast}
            placeholder={lastSet?.reps != null ? lastSet.reps.toString() : "Reps"}
            className="h-8 text-center text-sm"
            min={0}
          />
        </div>

        {/* Notes toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${showNotes || notes ? "text-primary" : "text-muted-foreground"}`}
          onClick={() => setShowNotes(!showNotes)}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>

        {/* Delete set */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Notes input (expandable) */}
      {showNotes && (
        <Input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Notes for this set..."
          className="h-8 text-sm ml-10"
        />
      )}
    </div>
  );
}

// Exercise card with all its sets
function ExerciseCard({
  log,
  lastPerformance,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onDeleteLog,
}: {
  log: ExerciseLogWithDetails;
  /** Working sets from the last time this exercise was trained. */
  lastPerformance: LastSetPerformance[] | undefined;
  onAddSet: () => void;
  onUpdateSet: (setId: string, updates: { is_warmup?: boolean; reps?: number | null; weight?: number | null; notes?: string | null }) => void;
  onDeleteSet: (setId: string) => void;
  onDeleteLog: () => void;
}) {
  // Warm-ups and working sets are numbered independently (W1, W2 / 1, 2, 3),
  // and each working set is paired with the same position from last session.
  const decoratedSets = useMemo(
    () =>
      log.sets.map((set, index) => {
        // Position among sets of the same kind. Sets per exercise are single
        // digits, so counting the preceding ones is cheaper than it looks.
        const preceding = log.sets.slice(0, index);
        if (set.is_warmup) {
          const warmupNumber = preceding.filter((s) => s.is_warmup).length + 1;
          return {
            set,
            label: `W${warmupNumber}`,
            lastSet: null as LastSetPerformance | null,
          };
        }
        const workingIndex = preceding.filter((s) => !s.is_warmup).length;
        return {
          set,
          label: String(workingIndex + 1),
          lastSet: getReferenceSet(lastPerformance, workingIndex),
        };
      }),
    [log.sets, lastPerformance]
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div>
          <p className="font-semibold">{log.exercise.name}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {CATEGORY_LABELS[log.exercise.category] || log.exercise.category}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDeleteLog}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
        <div className="w-9 text-center">Set</div>
        <div className="flex-1 text-center">Weight</div>
        <div className="flex-1 text-center">Reps</div>
        <div className="w-8"></div>
        <div className="w-8"></div>
      </div>

      {/* Sets. Warm-ups and working sets are numbered separately (W1, W2 /
          1, 2, 3) so the first working set always reads "1" — previously
          set_number counted warm-ups too, so it could start at 3. */}
      <div className="p-3 space-y-2">
        {decoratedSets.map(({ set, label, lastSet }) => (
          <SetRow
            key={set.id}
            set={set}
            label={label}
            lastSet={lastSet}
            onUpdate={(updates) => onUpdateSet(set.id, updates)}
            onDelete={() => onDeleteSet(set.id)}
          />
        ))}
      </div>

      {/* Legend — the amber/primary pill is otherwise unexplained, and a
          title tooltip is invisible on touch. */}
      <div className="flex items-center gap-3 px-3 pb-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary/20 border border-primary/30" />
          Working
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/30" />
          Warm-up
        </span>
        <span className="ml-auto">Tap a set number to switch</span>
      </div>

      {/* Add Set Button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-9 rounded-none border-t text-muted-foreground"
        onClick={onAddSet}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add Set
      </Button>
    </div>
  );
}

export function WorkoutTab() {
  const { selectedDate } = useDate();
  const dateString = format(selectedDate, "yyyy-MM-dd");

  const { logs, isLoading: isExerciseLoading, addLog, deleteLog, addSet, updateSet, deleteSet, refetch: refetchLogs } =
    useExerciseLogs(dateString);

  // What was done last time for each exercise in today's session, shown as
  // ghost text behind the inputs (double-tap a field to carry it forward).
  const sessionExerciseIds = useMemo(
    () => Array.from(new Set(logs.map((log) => log.exercise_id))),
    [logs]
  );
  const { lastPerformance } = useLastExercisePerformance(sessionExerciseIds, dateString);
  const {
    sessions: cardioSessions,
    isLoading: isCardioLoading,
    addSession: addCardioSession,
    updateSession: updateCardioSession,
    deleteSession: deleteCardioSession,
  } = useTreadmill(dateString);
  const {
    sessions: workoutSessions,
    isLoading: isSessionLoading,
    startSession,
    updateSessionNotes,
    linkWhoopWorkout,
    unlinkWhoopWorkout,
    deleteSession: deleteWorkoutSession,
  } = useWorkoutSessions(dateString);
  const [isExerciseDialogOpen, setIsExerciseDialogOpen] = useState(false);
  const [isWorkoutDialogOpen, setIsWorkoutDialogOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const isWorkoutLoading = isExerciseLoading || isSessionLoading;

  // Group exercises by session_id
  const exercisesBySession = useMemo(() => {
    const grouped = new Map<string, ExerciseLogWithDetails[]>();
    logs.forEach((log) => {
      if (log.session_id) {
        if (!grouped.has(log.session_id)) {
          grouped.set(log.session_id, []);
        }
        grouped.get(log.session_id)!.push(log);
      }
    });
    return grouped;
  }, [logs]);

  const handleAddCardioSession = async (exerciseType: CardioExerciseType) => {
    await addCardioSession(exerciseType);
  };

  const handleCreateWorkout = async (name: string, startTime: string) => {
    await startSession(name, startTime);
  };

  const handleAddExercise = async (exerciseId: string) => {
    if (currentSessionId) {
      await addLog(exerciseId, currentSessionId);
    }
    setIsExerciseDialogOpen(false);
    setCurrentSessionId(null);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteWorkoutSession(sessionId);
    // Refetch logs to update UI after cascade delete
    await refetchLogs();
  };

  return (
    <div className="space-y-4 p-4">
      <div className="text-center text-sm text-muted-foreground">
        {format(selectedDate, "EEEE, MMMM d, yyyy")}
      </div>

      {/* Header with Add Workout button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Workout Log</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setIsWorkoutDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Workout
        </Button>
      </div>

      {/* Loading */}
      {isWorkoutLoading && (
        <div className="text-center text-sm text-muted-foreground py-8">
          Loading...
        </div>
      )}

      {/* Empty State */}
      {!isWorkoutLoading && workoutSessions.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-muted p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">No workouts yet</p>
          <p className="text-xs text-muted-foreground">
            Tap &quot;Add Workout&quot; to create your first workout session
          </p>
        </div>
      )}

      {/* Workout Session Cards */}
      {!isWorkoutLoading && workoutSessions.length > 0 && (
        <div className="space-y-4">
          {workoutSessions.map((session) => (
            <WorkoutSessionCard
              key={session.id}
              session={session}
              exercises={exercisesBySession.get(session.id) || []}
              onUpdateName={updateSessionNotes}
              onLinkWhoop={linkWhoopWorkout}
              onUnlinkWhoop={unlinkWhoopWorkout}
              onDelete={handleDeleteSession}
              onAddExercise={() => {
                setCurrentSessionId(session.id);
                setIsExerciseDialogOpen(true);
              }}
              renderExerciseCard={(log) => (
                <ExerciseCard
                  log={log}
                  lastPerformance={lastPerformance[log.exercise_id]}
                  onAddSet={() => addSet(log.id)}
                  onUpdateSet={updateSet}
                  onDeleteSet={(setId) => deleteSet(log.id, setId)}
                  onDeleteLog={() => deleteLog(log.id)}
                />
              )}
            />
          ))}
        </div>
      )}

      {/* Cardio Section */}
      <CardioSection
        sessions={cardioSessions}
        isLoading={isCardioLoading}
        onAdd={handleAddCardioSession}
        onUpdate={updateCardioSession}
        onDelete={deleteCardioSession}
      />

      {/* Add Workout Dialog */}
      {isWorkoutDialogOpen && (
        <AddWorkoutDialog
          open
          onOpenChange={setIsWorkoutDialogOpen}
          onConfirm={handleCreateWorkout}
        />
      )}

      {/* Exercise Picker Dialog */}
      <ExercisePickerDialog
        open={isExerciseDialogOpen}
        onOpenChange={setIsExerciseDialogOpen}
        onSelectExercise={handleAddExercise}
      />
    </div>
  );
}
