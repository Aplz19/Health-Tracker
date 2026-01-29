"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionCardHeader } from "./session-card-header";
import type { WorkoutSession, CachedWhoopWorkout } from "@/lib/supabase/types";
import type { ExerciseLogWithDetails } from "@/hooks/use-exercise-logs";

interface WorkoutSessionCardProps {
  session: WorkoutSession;
  exercises: ExerciseLogWithDetails[];
  onUpdateName: (sessionId: string, name: string) => void;
  onLinkWhoop: (sessionId: string, workout: CachedWhoopWorkout) => Promise<void>;
  onUnlinkWhoop: (sessionId: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
  onAddExercise: () => void;
  renderExerciseCard: (log: ExerciseLogWithDetails) => React.ReactNode;
}

export function WorkoutSessionCard({
  session,
  exercises,
  onUpdateName,
  onLinkWhoop,
  onUnlinkWhoop,
  onDelete,
  onAddExercise,
  renderExerciseCard,
}: WorkoutSessionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <SessionCardHeader
        session={session}
        isExpanded={isExpanded}
        onToggleExpanded={() => setIsExpanded(!isExpanded)}
        onUpdateName={(name) => onUpdateName(session.id, name)}
        onLinkWhoop={(workout) => onLinkWhoop(session.id, workout)}
        onUnlinkWhoop={() => onUnlinkWhoop(session.id)}
        onDelete={() => onDelete(session.id)}
      />

      {/* Exercise list (only when expanded) */}
      {isExpanded && (
        <>
          {exercises.length > 0 && (
            <div className="p-3 space-y-4">
              {exercises.map((log) => (
                <div key={log.id}>{renderExerciseCard(log)}</div>
              ))}
            </div>
          )}

          {/* Add Exercise button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-9 rounded-none border-t text-muted-foreground"
            onClick={onAddExercise}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Exercise
          </Button>
        </>
      )}
    </div>
  );
}
