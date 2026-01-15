"use client";

import { useState } from "react";
import { Pill, ListChecks, Activity } from "lucide-react";
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
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="habits" className="flex items-center gap-2 text-base py-3">
              <ListChecks className="h-5 w-5" />
              <span>Habits</span>
            </TabsTrigger>
            <TabsTrigger value="supplements" className="flex items-center gap-2 text-base py-3">
              <Pill className="h-5 w-5" />
              <span>Supplements</span>
            </TabsTrigger>
            <TabsTrigger value="whoop" className="flex items-center gap-2 text-base py-3">
              <Activity className="h-5 w-5" />
              <span>Whoop</span>
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="habits" className="m-0">
              <HabitsSettings />
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
