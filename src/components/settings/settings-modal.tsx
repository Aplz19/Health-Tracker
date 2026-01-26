"use client";

import { useState } from "react";
import { Pill, ListChecks, Activity, BarChart3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HabitsSettings } from "./habits-settings";
import { SupplementsSettings } from "./supplements-settings";
import { WhoopSettings } from "./whoop-settings";
import { AnalyticsSettings } from "./analytics-settings";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState("habits");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 h-12">
            <TabsTrigger value="habits" className="flex items-center gap-1 text-sm py-3">
              <ListChecks className="h-4 w-4" />
              <span>Habits</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1 text-sm py-3">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="supplements" className="flex items-center gap-1 text-sm py-3">
              <Pill className="h-4 w-4" />
              <span>Supps</span>
            </TabsTrigger>
            <TabsTrigger value="whoop" className="flex items-center gap-1 text-sm py-3">
              <Activity className="h-4 w-4" />
              <span>Whoop</span>
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="habits" className="m-0">
              <HabitsSettings />
            </TabsContent>
            <TabsContent value="analytics" className="m-0">
              <AnalyticsSettings />
            </TabsContent>
            <TabsContent value="supplements" className="m-0">
              <SupplementsSettings />
            </TabsContent>
            <TabsContent value="whoop" className="m-0">
              <WhoopSettings />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
