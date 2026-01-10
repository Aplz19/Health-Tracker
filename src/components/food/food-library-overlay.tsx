"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { FoodPanel } from "./food-panel";
import { cn } from "@/lib/utils";

export function FoodLibraryOverlay() {
  const { isFoodLibraryOpen, closeFoodLibrary } = useApp();

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] bg-background transition-transform duration-300 ease-in-out",
        isFoodLibraryOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 border-b bg-background">
        <h1 className="text-lg font-semibold">Food Library</h1>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeFoodLibrary}>
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      {/* Content */}
      <div className="h-[calc(100vh-3.5rem)]">
        <FoodPanel />
      </div>
    </div>
  );
}
