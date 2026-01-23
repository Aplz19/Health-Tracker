"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHabitPreferencesContext } from "@/contexts/habit-preferences-context";
import type { UserHabit } from "@/types/habits";

// Sortable habit row for enabled habits
function SortableHabitRow({
  habit,
  onToggle,
  onConfigure,
}: {
  habit: UserHabit;
  onToggle: (enabled: boolean) => void;
  onConfigure: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: habit.definition.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = habit.definition.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <button
          className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Icon className={`h-5 w-5 ${habit.definition.color}`} />
        <span className="font-medium">{habit.definition.label}</span>
        <span className="text-xs text-muted-foreground capitalize">
          ({habit.trackingMode})
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onConfigure}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        <Switch checked={habit.isEnabled} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

// Regular habit row for disabled habits
function HabitRow({
  habit,
  onToggle,
}: {
  habit: UserHabit;
  onToggle: (enabled: boolean) => void;
}) {
  const Icon = habit.definition.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 opacity-60">
      <div className="flex items-center gap-2 pl-7">
        <Icon className={`h-5 w-5 ${habit.definition.color}`} />
        <span className="font-medium">{habit.definition.label}</span>
      </div>
      <Switch checked={habit.isEnabled} onCheckedChange={onToggle} />
    </div>
  );
}

// Configuration dialog for habit settings
function HabitConfigDialog({
  habitKey,
  open,
  onOpenChange,
}: {
  habitKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { getAllHabits, setTrackingMode, setGoalAmount } = useHabitPreferencesContext();
  const [localGoal, setLocalGoal] = useState("");

  // Get fresh habit data from context on every render
  const habit = habitKey ? getAllHabits().find(h => h.definition.key === habitKey) : null;

  useEffect(() => {
    if (habit) {
      setLocalGoal(habit.goalAmount.toString());
    }
  }, [habit?.goalAmount]);

  if (!habit) return null;

  const Icon = habit.definition.icon;

  const handleModeChange = (mode: "checkbox" | "goal" | "manual") => {
    setTrackingMode(habit.definition.key, mode);
  };

  const handleGoalBlur = () => {
    const numValue = parseFloat(localGoal) || habit.definition.defaultGoal;
    setGoalAmount(habit.definition.key, numValue);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${habit.definition.color}`} />
            {habit.definition.label} Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Tracking Mode</Label>
            <Select
              value={habit.trackingMode}
              onValueChange={(v) => handleModeChange(v as "checkbox" | "goal" | "manual")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checkbox">
                  <div className="flex flex-col items-start">
                    <span>Checkbox</span>
                    <span className="text-xs text-muted-foreground">
                      Simple done/not done
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="goal">
                  <div className="flex flex-col items-start">
                    <span>Goal</span>
                    <span className="text-xs text-muted-foreground">
                      Checkbox that logs a specific amount
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="manual">
                  <div className="flex flex-col items-start">
                    <span>Manual</span>
                    <span className="text-xs text-muted-foreground">
                      Enter the exact amount
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(habit.trackingMode === "goal" || habit.trackingMode === "manual") && (
            <div className="space-y-2">
              <Label>
                {habit.trackingMode === "goal" ? "Goal Amount" : "Default Goal"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={localGoal}
                  onChange={(e) => setLocalGoal(e.target.value)}
                  onBlur={handleGoalBlur}
                  className="w-24"
                  min={1}
                  step={habit.definition.step}
                />
                <span className="text-sm text-muted-foreground">
                  {habit.definition.unit}
                </span>
              </div>
              {habit.trackingMode === "goal" && (
                <p className="text-xs text-muted-foreground">
                  Checking the box will log this amount
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HabitsSettings() {
  const {
    getAllHabits,
    getEnabledHabits,
    toggleHabit,
    reorderHabits,
    isLoading,
  } = useHabitPreferencesContext();

  const [configHabitKey, setConfigHabitKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const allHabits = getAllHabits();
  const enabledHabits = getEnabledHabits();
  const disabledHabits = allHabits.filter((h) => !h.isEnabled);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = enabledHabits.findIndex(
        (h) => h.definition.key === active.id
      );
      const newIndex = enabledHabits.findIndex(
        (h) => h.definition.key === over.id
      );

      const newOrder = arrayMove(enabledHabits, oldIndex, newIndex);
      reorderHabits(newOrder.map((h) => h.definition.key));
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 text-center">
        <span className="text-sm text-muted-foreground">Loading habits...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Tracked Habits</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Drag to reorder. Tap the gear to configure tracking mode.
        </p>

        {enabledHabits.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No habits enabled. Toggle habits below to start tracking.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={enabledHabits.map((h) => h.definition.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {enabledHabits.map((habit) => (
                  <SortableHabitRow
                    key={habit.definition.key}
                    habit={habit}
                    onToggle={(enabled) =>
                      toggleHabit(habit.definition.key, enabled)
                    }
                    onConfigure={() => setConfigHabitKey(habit.definition.key)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {disabledHabits.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Available Habits</h3>
          <div className="space-y-2">
            {disabledHabits.map((habit) => (
              <HabitRow
                key={habit.definition.key}
                habit={habit}
                onToggle={(enabled) =>
                  toggleHabit(habit.definition.key, enabled)
                }
              />
            ))}
          </div>
        </div>
      )}

      <HabitConfigDialog
        habitKey={configHabitKey}
        open={configHabitKey !== null}
        onOpenChange={(open) => !open && setConfigHabitKey(null)}
      />
    </div>
  );
}
