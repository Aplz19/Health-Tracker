"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { RefreshCw, Activity, Flame, Heart, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWhoopWorkouts } from "@/hooks/use-whoop-workouts";
import { getWhoopSportName } from "@/lib/whoop/types";
import type { CachedWhoopWorkout } from "@/lib/supabase/types";

interface WhoopLinkDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (workout: CachedWhoopWorkout) => Promise<void>;
}

function formatDuration(startTime: string, endTime: string): string {
  const start = parseISO(startTime);
  const end = parseISO(endTime);
  const diffMs = end.getTime() - start.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatTime(isoString: string): string {
  return format(parseISO(isoString), "MMM d, h:mm a");
}

export function WhoopLinkDialog({
  open,
  onClose,
  onSelect,
}: WhoopLinkDialogProps) {
  const { workouts, isLoading, isSyncing, fetchWorkouts, syncWorkouts } = useWhoopWorkouts();
  const [isSelecting, setIsSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchWorkouts({ unlinkedOnly: true });
    }
  }, [open, fetchWorkouts]);

  const handleSync = async () => {
    await syncWorkouts(30);
    await fetchWorkouts({ unlinkedOnly: true });
  };

  const handleSelect = async (workout: CachedWhoopWorkout) => {
    setIsSelecting(workout.id);
    try {
      await onSelect(workout);
    } finally {
      setIsSelecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-orange-500" />
            Link Whoop Workout
          </DialogTitle>
        </DialogHeader>

        {/* Sync button */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync from Whoop"}
          </Button>
        </div>

        {/* Workouts list */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Loading workouts...
            </div>
          ) : workouts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-2">
                No unlinked workouts found
              </p>
              <p className="text-xs text-muted-foreground">
                Complete a workout on Whoop and tap &quot;Sync from Whoop&quot;
              </p>
            </div>
          ) : (
            workouts.map((workout) => (
              <button
                key={workout.id}
                className="w-full text-left rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors disabled:opacity-50"
                onClick={() => handleSelect(workout)}
                disabled={isSelecting !== null}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">
                    {getWhoopSportName(workout.sport_id)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(workout.start_time)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(workout.start_time, workout.end_time)}</span>
                  </div>
                  {workout.strain && (
                    <div className="flex items-center gap-1 text-orange-500">
                      <Flame className="h-3 w-3" />
                      <span>{workout.strain.toFixed(1)}</span>
                    </div>
                  )}
                  {workout.avg_hr && (
                    <div className="flex items-center gap-1 text-red-500">
                      <Heart className="h-3 w-3" />
                      <span>{workout.avg_hr} bpm</span>
                    </div>
                  )}
                </div>

                {isSelecting === workout.id && (
                  <div className="mt-2 text-xs text-primary">Linking...</div>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
