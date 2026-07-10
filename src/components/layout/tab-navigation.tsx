"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Apple, Activity, Dumbbell, BarChart3, ListChecks } from "lucide-react";

function TabLoading() {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

// Each feature tab owns a sizable UI/data graph. Keeping them behind dynamic
// boundaries means the initial dietary view does not also download every
// inactive tab.
const DietaryTab = dynamic(
  () => import("@/components/tabs/dietary-tab").then((m) => m.DietaryTab),
  { loading: TabLoading }
);
const WorkoutTab = dynamic(
  () => import("@/components/tabs/workout-tab").then((m) => m.WorkoutTab),
  { loading: TabLoading }
);
const HabitsTab = dynamic(
  () => import("@/components/tabs/habits-tab").then((m) => m.HabitsTab),
  { loading: TabLoading }
);
const WhoopTab = dynamic(
  () => import("@/components/tabs/whoop-tab").then((m) => m.WhoopTab),
  { loading: TabLoading }
);
const AnalyticsTab = dynamic(
  () => import("@/components/tabs/analytics-tab").then((m) => m.AnalyticsTab),
  { loading: TabLoading }
);

export function TabNavigation() {
  return (
    <Tabs defaultValue="dietary" className="w-full">
      <TabsList className="grid h-11 w-full grid-cols-5 sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-40 bg-background sm:h-9">
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
