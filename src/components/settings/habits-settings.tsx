"use client";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function HabitsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Habits Tracking</h3>
        <p className="text-sm text-muted-foreground">
          Configure your daily habits to track.
        </p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">Coming soon</Label>
          <p className="text-sm text-muted-foreground">
            Habit tracking configuration will be available in a future update.
            You&apos;ll be able to add custom habits like meditation, reading,
            journaling, and more.
          </p>
        </div>
      </div>
    </div>
  );
}
