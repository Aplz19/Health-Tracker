"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Unlink,
  Trash2,
  Activity,
  Heart,
  Clock,
  Flame,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WhoopLinkDialog } from "./whoop-link-dialog";
import type { WorkoutSession, CachedWhoopWorkout } from "@/lib/supabase/types";

interface SessionCardHeaderProps {
  session: WorkoutSession;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onUpdateName: (name: string) => void;
  onLinkWhoop: (workout: CachedWhoopWorkout) => Promise<void>;
  onUnlinkWhoop: () => Promise<void>;
  onDelete: () => Promise<void>;
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

export function SessionCardHeader({
  session,
  isExpanded,
  onToggleExpanded,
  onUpdateName,
  onLinkWhoop,
  onUnlinkWhoop,
  onDelete,
}: SessionCardHeaderProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(session.notes || "Workout");

  const hasWhoopData = session.whoop_workout_id !== null;

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (editedName !== session.notes) {
      onUpdateName(editedName);
    }
  };

  const handleLinkWorkout = async (workout: CachedWhoopWorkout) => {
    await onLinkWhoop(workout);
    setIsLinkDialogOpen(false);
  };

  return (
    <>
      <div className="bg-card">
        {/* Main header row */}
        <div className="flex items-center gap-2 p-3 border-b">
          {/* Collapse toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onToggleExpanded}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>

          {/* Editable name */}
          {isEditingName ? (
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameBlur();
                if (e.key === "Escape") {
                  setEditedName(session.notes || "Workout");
                  setIsEditingName(false);
                }
              }}
              className="h-7 text-sm font-medium flex-1"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="text-sm font-medium flex-1 text-left hover:text-primary transition-colors"
            >
              {session.notes || "Workout"}
            </button>
          )}

          {/* Time */}
          {session.start_time && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatTime(session.start_time)}
            </span>
          )}

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!hasWhoopData ? (
                <DropdownMenuItem onClick={() => setIsLinkDialogOpen(true)}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Link Whoop Workout
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onUnlinkWhoop}>
                  <Unlink className="h-4 w-4 mr-2" />
                  Unlink Whoop Workout
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Whoop metrics (if linked and expanded) */}
        {isExpanded && hasWhoopData && session.start_time && session.end_time && (
          <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 p-3 border-b">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-600 dark:text-orange-400 mb-2">
              <Activity className="h-4 w-4" />
              Whoop Workout Linked
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
      </div>

      <WhoopLinkDialog
        open={isLinkDialogOpen}
        onClose={() => setIsLinkDialogOpen(false)}
        onSelect={handleLinkWorkout}
      />
    </>
  );
}
