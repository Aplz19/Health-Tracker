"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { ExercisePanel } from "./exercise-panel";
import { cn } from "@/lib/utils";

export function ExerciseLibraryOverlay() {
  const { isExerciseLibraryOpen, closeExerciseLibrary } = useApp();
  const [panelKey, setPanelKey] = useState(0);

  // Reset panel state when overlay opens
  useEffect(() => {
    if (isExerciseLibraryOpen) {
      setPanelKey((k) => k + 1);
    }
  }, [isExerciseLibraryOpen]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] bg-background transition-transform duration-300 ease-in-out",
        isExerciseLibraryOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 border-b bg-background">
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

      {/* Content - key forces remount when opened to reset state */}
      <div className="h-[calc(100vh-3.5rem)]">
        {isExerciseLibraryOpen && <ExercisePanel key={panelKey} />}
      </div>
    </div>
  );
}
