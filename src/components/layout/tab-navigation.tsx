"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DietaryTab } from "@/components/tabs/dietary-tab";
import { WhoopTab } from "@/components/tabs/whoop-tab";
import { WorkoutTab } from "@/components/tabs/workout-tab";
import { HabitsTab } from "@/components/tabs/habits-tab";
import { AnalyticsTab } from "@/components/tabs/analytics-tab";
import { Apple, Activity, Dumbbell, BarChart3, ListChecks } from "lucide-react";

export function TabNavigation() {
  return (
    <Tabs defaultValue="dietary" className="w-full">
      <TabsList className="grid w-full grid-cols-5 sticky top-14 z-40 bg-background">
        <TabsTrigger value="dietary" className="flex items-center gap-1.5">
          <Apple className="h-4 w-4" />
          <span className="hidden sm:inline">Dietary</span>
        </TabsTrigger>
        <TabsTrigger value="workout" className="flex items-center gap-1.5">
          <Dumbbell className="h-4 w-4" />
          <span className="hidden sm:inline">Workout</span>
        </TabsTrigger>
        <TabsTrigger value="habits" className="flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" />
          <span className="hidden sm:inline">Habits</span>
        </TabsTrigger>
        <TabsTrigger value="whoop" className="flex items-center gap-1.5">
          <Activity className="h-4 w-4" />
          <span className="hidden sm:inline">Whoop</span>
        </TabsTrigger>
        <TabsTrigger value="analytics" className="flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Analytics</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dietary" className="mt-0">
        <DietaryTab />
      </TabsContent>
      <TabsContent value="workout" className="mt-0">
        <WorkoutTab />
      </TabsContent>
      <TabsContent value="habits" className="mt-0">
        <HabitsTab />
      </TabsContent>
      <TabsContent value="whoop" className="mt-0">
        <WhoopTab />
      </TabsContent>
      <TabsContent value="analytics" className="mt-0">
        <AnalyticsTab />
      </TabsContent>
    </Tabs>
  );
}
