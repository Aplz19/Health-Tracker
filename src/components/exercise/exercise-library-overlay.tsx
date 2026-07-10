"use client";

import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { cn } from "@/lib/utils";

const ExercisePanel = dynamic(
  () => import("./exercise-panel").then((m) => m.ExercisePanel),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading exercise library...
      </div>
    ),
  }
);

export function ExerciseLibraryOverlay() {
  const { isExerciseLibraryOpen, closeExerciseLibrary } = useApp();

  return (
    <div
      aria-hidden={!isExerciseLibraryOpen}
      inert={!isExerciseLibraryOpen}
      className={cn(
        "fixed inset-0 z-[100] bg-background transition-transform duration-300 ease-in-out",
        isExerciseLibraryOpen
          ? "translate-x-0"
          : "pointer-events-none translate-x-full"
      )}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-end justify-between border-b bg-background px-4 pb-3">
        <h1 className="text-lg font-semibold">Exercise Library</h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={closeExerciseLibrary}
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      {/* Content mounts on demand and resets naturally each time it opens. */}
      <div className="h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
        {isExerciseLibraryOpen && <ExercisePanel />}
      </div>
    </div>
  );
}
