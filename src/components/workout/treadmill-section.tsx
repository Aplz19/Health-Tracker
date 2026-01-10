"use client";

import { useState } from "react";
import { Plus, Trash2, Timer, TrendingUp, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TreadmillSession } from "@/lib/supabase/types";

interface TreadmillSessionRowProps {
  session: TreadmillSession;
  onUpdate: (updates: Partial<Pick<TreadmillSession, "duration_minutes" | "incline" | "speed" | "notes">>) => void;
  onDelete: () => void;
}

function TreadmillSessionRow({ session, onUpdate, onDelete }: TreadmillSessionRowProps) {
  const [duration, setDuration] = useState(session.duration_minutes.toString());
  const [incline, setIncline] = useState(session.incline.toString());
  const [speed, setSpeed] = useState(session.speed.toString());

  const handleDurationBlur = () => {
    const newDuration = duration ? parseInt(duration) : 0;
    if (newDuration !== session.duration_minutes) {
      onUpdate({ duration_minutes: newDuration });
    }
  };

  const handleInclineBlur = () => {
    const newIncline = incline ? parseFloat(incline) : 0;
    if (newIncline !== session.incline) {
      onUpdate({ incline: newIncline });
    }
  };

  const handleSpeedBlur = () => {
    const newSpeed = speed ? parseFloat(speed) : 0;
    if (newSpeed !== session.speed) {
      onUpdate({ speed: newSpeed });
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
      {/* Duration */}
      <div className="flex-1">
        <div className="flex items-center gap-1 mb-1">
          <Timer className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Min</span>
        </div>
        <Input
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onBlur={handleDurationBlur}
          className="h-8 text-center text-sm"
          min={0}
        />
      </div>

      {/* Incline */}
      <div className="flex-1">
        <div className="flex items-center gap-1 mb-1">
          <TrendingUp className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Incline %</span>
        </div>
        <Input
          type="number"
          value={incline}
          onChange={(e) => setIncline(e.target.value)}
          onBlur={handleInclineBlur}
          className="h-8 text-center text-sm"
          min={0}
          max={15}
          step={0.5}
        />
      </div>

      {/* Speed */}
      <div className="flex-1">
        <div className="flex items-center gap-1 mb-1">
          <Gauge className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Speed</span>
        </div>
        <Input
          type="number"
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
          onBlur={handleSpeedBlur}
          className="h-8 text-center text-sm"
          min={0}
          max={12}
          step={0.1}
        />
      </div>

      {/* Delete */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive mt-5"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface TreadmillSectionProps {
  sessions: TreadmillSession[];
  isLoading: boolean;
  onAdd: () => Promise<unknown>;
  onUpdate: (id: string, updates: Partial<Pick<TreadmillSession, "duration_minutes" | "incline" | "speed" | "notes">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TreadmillSection({
  sessions,
  isLoading,
  onAdd,
  onUpdate,
  onDelete,
}: TreadmillSectionProps) {
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      await onAdd();
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Timer className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold">Treadmill</p>
            <p className="text-xs text-muted-foreground">Cardio sessions</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={handleAdd}
          disabled={isAdding}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Sessions */}
      <div className="p-3 space-y-2">
        {isLoading && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Loading...
          </p>
        )}

        {!isLoading && sessions.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No treadmill sessions logged
          </p>
        )}

        {!isLoading && sessions.map((session) => (
          <TreadmillSessionRow
            key={session.id}
            session={session}
            onUpdate={(updates) => onUpdate(session.id, updates)}
            onDelete={() => onDelete(session.id)}
          />
        ))}
      </div>
    </div>
  );
}
