"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
  UtensilsCrossed,
  Dumbbell,
  Settings,
  BarChart3,
  Database,
  Loader2,
} from "lucide-react";
import { useDailySummary } from "@/hooks/use-daily-summary";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDate } from "@/contexts/date-context";
import { useApp } from "@/contexts/app-context";
import { cn } from "@/lib/utils";

export function Header() {
  const {
    selectedDate,
    setSelectedDate,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  } = useDate();
  const { openFoodLibrary, openExerciseLibrary } = useApp();
  const { syncDate, isLoading: isSyncing } = useDailySummary();
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleSyncToday = async () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const result = await syncDate(dateStr);
    if (result) {
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 2000);
    }
  };

  const isToday =
    format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-md items-center justify-between px-4 mx-auto">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={openFoodLibrary}>
                <UtensilsCrossed className="h-4 w-4 mr-2" />
                Food Library
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openExerciseLibrary}>
                <Dumbbell className="h-4 w-4 mr-2" />
                Exercise Library
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSyncToday} disabled={isSyncing}>
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 mr-2" />
                )}
                {isSyncing ? "Syncing..." : syncSuccess ? "Synced!" : "Sync Daily Summary"}
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <h1 className="text-lg font-semibold tracking-tight">Health Tracker</h1>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToPreviousDay}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous day</span>
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-8 justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToNextDay}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next day</span>
          </Button>

          {!isToday && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={goToToday}
            >
              Today
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
