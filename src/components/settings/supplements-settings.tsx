"use client";

import { useState } from "react";
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
import { GripVertical, X, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupplementPreferencesContext } from "@/contexts/supplement-preferences-context";
import type { UserSupplement } from "@/types/supplements";

// Sortable supplement row for tracked supplements
function SortableSupplementRow({
  supplement,
  onRemove,
  onModeChange,
  onGoalChange,
}: {
  supplement: UserSupplement;
  onRemove: () => void;
  onModeChange: (mode: "manual" | "goal") => void;
  onGoalChange: (amount: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: supplement.definition.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [goalValue, setGoalValue] = useState(supplement.goalAmount.toString());

  const handleGoalBlur = () => {
    const numValue = parseFloat(goalValue) || supplement.definition.defaultGoal;
    if (numValue !== supplement.goalAmount) {
      onGoalChange(numValue);
    }
  };

  const Icon = supplement.definition.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon className={`h-4 w-4 ${supplement.definition.color} shrink-0`} />
        <span className="font-medium text-sm truncate">
          {supplement.definition.label}
        </span>
      </div>

      <Select
        value={supplement.trackingMode}
        onValueChange={(value) => onModeChange(value as "manual" | "goal")}
      >
        <SelectTrigger className="w-24 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="manual">Manual</SelectItem>
          <SelectItem value="goal">Goal</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={goalValue}
          onChange={(e) => setGoalValue(e.target.value)}
          onBlur={handleGoalBlur}
          className="w-20 h-7 text-center text-sm"
          min={0}
          step={supplement.definition.step}
        />
        <span className="text-xs text-muted-foreground w-8">
          {supplement.definition.unit}
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Available supplement row (not yet added)
function AvailableSupplementRow({
  supplement,
  onAdd,
}: {
  supplement: UserSupplement;
  onAdd: () => void;
}) {
  const Icon = supplement.definition.icon;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed bg-card/50 px-3 py-2">
      <Checkbox
        id={supplement.definition.key}
        onCheckedChange={(checked) => {
          if (checked) onAdd();
        }}
      />
      <label
        htmlFor={supplement.definition.key}
        className="flex items-center gap-2 flex-1 cursor-pointer"
      >
        <Icon className={`h-4 w-4 ${supplement.definition.color}`} />
        <span className="font-medium text-sm">{supplement.definition.label}</span>
        <span className="text-xs text-muted-foreground">
          ({supplement.definition.defaultGoal} {supplement.definition.unit})
        </span>
      </label>
    </div>
  );
}

export function SupplementsSettings() {
  const {
    isLoading,
    getAllSupplements,
    toggleSupplement,
    setTrackingMode,
    setGoalAmount,
    reorderSupplements,
  } = useSupplementPreferencesContext();

  const allSupplements = getAllSupplements();
  const enabledSupplements = allSupplements
    .filter((s) => s.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const availableSupplements = allSupplements.filter((s) => !s.isEnabled);

  // Set all enabled supplements to a specific mode
  const setAllMode = (mode: "manual" | "goal") => {
    enabledSupplements.forEach((s) => {
      if (s.trackingMode !== mode) {
        setTrackingMode(s.definition.key, mode);
      }
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = enabledSupplements.findIndex(
        (s) => s.definition.key === active.id
      );
      const newIndex = enabledSupplements.findIndex(
        (s) => s.definition.key === over.id
      );

      const newOrder = arrayMove(enabledSupplements, oldIndex, newIndex);
      const orderedKeys = newOrder.map((s) => s.definition.key);
      reorderSupplements(orderedKeys);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Supplements</h3>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Supplements</h3>
        <p className="text-sm text-muted-foreground">
          Choose which supplements to track and how to track them.
        </p>
      </div>

      {/* Quick mode toggle buttons */}
      {enabledSupplements.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Set all to:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAllMode("manual")}
            className="h-8"
          >
            Manual
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAllMode("goal")}
            className="h-8"
          >
            Goal
          </Button>
        </div>
      )}

      <Separator />

      {/* Tracked Supplements (Draggable) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Your Tracked Supplements</Label>
          {enabledSupplements.length > 1 && (
            <span className="text-xs text-muted-foreground">
              Drag to reorder
            </span>
          )}
        </div>

        {enabledSupplements.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No supplements tracked yet. Add some below!
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={enabledSupplements.map((s) => s.definition.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {enabledSupplements.map((supplement) => (
                  <SortableSupplementRow
                    key={supplement.definition.key}
                    supplement={supplement}
                    onRemove={() =>
                      toggleSupplement(supplement.definition.key, false)
                    }
                    onModeChange={(mode) =>
                      setTrackingMode(supplement.definition.key, mode)
                    }
                    onGoalChange={(amount) =>
                      setGoalAmount(supplement.definition.key, amount)
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Available Supplements */}
      {availableSupplements.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label className="text-sm font-medium">Available Supplements</Label>
            <div className="space-y-2">
              {availableSupplements.map((supplement) => (
                <AvailableSupplementRow
                  key={supplement.definition.key}
                  supplement={supplement}
                  onAdd={() => toggleSupplement(supplement.definition.key, true)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Mode Explanation */}
      <Separator />
      <div className="space-y-2">
        <Label className="text-sm font-medium text-muted-foreground">
          Tracking Modes
        </Label>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Manual:</strong> Enter the exact amount you took each day
          </p>
          <p>
            <strong>Goal:</strong> Just check a box to log your goal amount
          </p>
        </div>
      </div>
    </div>
  );
}
