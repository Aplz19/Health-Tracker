"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Play, Link2, Unlink, Activity, Heart, Clock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhoopLinkDialog } from "./whoop-link-dialog";
import type { WorkoutSession, CachedWhoopWorkout } from "@/lib/supabase/types";

interface SessionHeaderProps {
  session: WorkoutSession | null;
  isLoading: boolean;
  onStartSession: () => Promise<void>;
  onLinkWhoop: (workout: CachedWhoopWorkout) => Promise<void>;
  onUnlinkWhoop: () => Promise<void>;
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
  return format(parseISO(isoString), "h:mm a");
}

export function SessionHeader({
  session,
  isLoading,
  onStartSession,
  onLinkWhoop,
  onUnlinkWhoop,
}: SessionHeaderProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleStartSession = async () => {
    setIsStarting(true);
    try {
      await onStartSession();
    } finally {
      setIsStarting(false);
    }
  };

  const handleLinkWorkout = async (workout: CachedWhoopWorkout) => {
    await onLinkWhoop(workout);
    setIsLinkDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="animate-pulse h-10 bg-muted rounded" />
      </div>
    );
  }

  // No session yet - show start button
  if (!session) {
    return (
      <div className="rounded-lg border-2 border-dashed border-muted p-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleStartSession}
          disabled={isStarting}
        >
          <Play className="h-4 w-4 mr-2" />
          {isStarting ? "Starting..." : "Start Workout Session"}
        </Button>
      </div>
    );
  }

  // Session exists - show session info
  const hasWhoopData = session.whoop_workout_id !== null;

  return (
    <>
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Whoop data section (if linked) */}
        {hasWhoopData && session.start_time && session.end_time && (
          <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-600 dark:text-orange-400">
                <Activity className="h-4 w-4" />
                Whoop Workout Linked
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={onUnlinkWhoop}
              >
                <Unlink className="h-3 w-3 mr-1" />
                Unlink
              </Button>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* Time */}
              <div className="bg-background/50 rounded p-2">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Clock className="h-3 w-3" />
                  <span className="text-xs">Time</span>
                </div>
                <div className="text-sm font-semibold">
                  {formatDuration(session.start_time, session.end_time)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatTime(session.start_time)}
                </div>
              </div>

              {/* Strain */}
              <div className="bg-background/50 rounded p-2">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Flame className="h-3 w-3" />
                  <span className="text-xs">Strain</span>
                </div>
                <div className="text-sm font-semibold text-orange-500">
                  {session.strain?.toFixed(1) ?? "-"}
                </div>
              </div>

              {/* Avg HR */}
              <div className="bg-background/50 rounded p-2">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Heart className="h-3 w-3" />
                  <span className="text-xs">Avg HR</span>
                </div>
                <div className="text-sm font-semibold text-red-500">
                  {session.avg_hr ?? "-"}
                </div>
              </div>

              {/* Max HR */}
              <div className="bg-background/50 rounded p-2">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Heart className="h-3 w-3" />
                  <span className="text-xs">Max HR</span>
                </div>
                <div className="text-sm font-semibold text-red-600">
                  {session.max_hr ?? "-"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Link button (if not linked) */}
        {!hasWhoopData && (
          <div className="p-3 bg-muted/30">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setIsLinkDialogOpen(true)}
            >
              <Link2 className="h-4 w-4 mr-2" />
              Link to Whoop Workout
            </Button>
          </div>
        )}
      </div>

      <WhoopLinkDialog
        open={isLinkDialogOpen}
        onClose={() => setIsLinkDialogOpen(false)}
        onSelect={handleLinkWorkout}
      />
    </>
  );
}
