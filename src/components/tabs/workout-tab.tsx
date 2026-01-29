"use client";

import { useState, useMemo } from "react";
import { Dumbbell, Plus, Trash2, MessageSquare } from "lucide-react";
import { useDate } from "@/contexts/date-context";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExerciseLogs } from "@/hooks/use-exercise-logs";
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
  onUpdate,
  onDelete,
}: {
  set: ExerciseSetWithDetails;
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

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* Set number & type toggle */}
        <button
          onClick={toggleWarmup}
          className={`w-8 h-8 rounded text-xs font-medium flex items-center justify-center transition-colors ${
            set.is_warmup
              ? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
              : "bg-primary/20 text-primary border border-primary/30"
          }`}
          title={set.is_warmup ? "Warm-up set (click to change)" : "Working set (click to change)"}
        >
          {set.is_warmup ? "W" : set.set_number}
        </button>

        {/* Reps input */}
        <div className="flex-1">
          <Input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={handleRepsBlur}
            placeholder="Reps"
            className="h-8 text-center text-sm"
            min={0}
          />
        </div>

        {/* Weight input */}
        <div className="flex-1">
          <Input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={handleWeightBlur}
            placeholder="lbs"
            className="h-8 text-center text-sm"
            min={0}
            step={2.5}
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
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onDeleteLog,
}: {
  log: ExerciseLogWithDetails;
  onAddSet: () => void;
  onUpdateSet: (setId: string, updates: { is_warmup?: boolean; reps?: number | null; weight?: number | null; notes?: string | null }) => void;
  onDeleteSet: (setId: string) => void;
  onDeleteLog: () => void;
}) {
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
        <div className="w-8 text-center">Set</div>
        <div className="flex-1 text-center">Reps</div>
        <div className="flex-1 text-center">Weight</div>
        <div className="w-8"></div>
        <div className="w-8"></div>
      </div>

      {/* Sets */}
      <div className="p-3 space-y-2">
        {log.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            onUpdate={(updates) => onUpdateSet(set.id, updates)}
            onDelete={() => onDeleteSet(set.id)}
          />
        ))}
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

  const { logs, isLoading, addLog, deleteLog, addSet, updateSet, deleteSet, refetch: refetchLogs } =
    useExerciseLogs(dateString);
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
      {isSessionLoading && (
        <div className="text-center text-sm text-muted-foreground py-8">
          Loading...
        </div>
      )}

      {/* Empty State */}
      {!isSessionLoading && workoutSessions.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-muted p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">No workouts yet</p>
          <p className="text-xs text-muted-foreground">
            Tap &quot;Add Workout&quot; to create your first workout session
          </p>
        </div>
      )}

      {/* Workout Session Cards */}
      {!isSessionLoading && workoutSessions.length > 0 && (
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
      <AddWorkoutDialog
        open={isWorkoutDialogOpen}
        onOpenChange={setIsWorkoutDialogOpen}
        onConfirm={handleCreateWorkout}
      />

      {/* Exercise Picker Dialog */}
      <ExercisePickerDialog
        open={isExerciseDialogOpen}
        onOpenChange={setIsExerciseDialogOpen}
        onSelectExercise={handleAddExercise}
      />
    </div>
  );
}
