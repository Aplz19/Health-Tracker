"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { GripVertical, ChevronRight, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useHabitPreferencesContext } from "@/contexts/habit-preferences-context";
import { HabitIcon } from "@/components/habits/habit-icon";
import { HabitEditorDialog } from "./habit-editor-dialog";
import type { ResolvedHabit } from "@/types/habits";

const KIND_LABELS: Record<ResolvedHabit["valueKind"], string> = {
  checkbox: "checkbox",
  number: "number",
  scale: "scale 1-5",
  choice: "choice",
};

// Sortable row for enabled habits. The whole row (except grip + switch)
// opens the full-screen editor - no tiny gear target.
function SortableHabitRow({
  habit,
  onToggle,
  onEdit,
}: {
  habit: ResolvedHabit;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: habit.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-h-[52px] items-center justify-between rounded-lg border bg-card px-3 py-2"
    >
      <div className="flex flex-1 items-center gap-1 overflow-hidden">
        <button
          className="cursor-grab touch-none p-2 text-muted-foreground hover:text-foreground"
          aria-label={`Reorder ${habit.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden text-left"
        >
          <HabitIcon habit={habit} />
          <span className="truncate font-medium">{habit.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            ({KIND_LABELS[habit.valueKind]})
          </span>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
      <Switch
        checked={habit.isEnabled}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${habit.name}`}
        className="ml-2"
      />
    </div>
  );
}

// Row for disabled (available) habits
function DisabledHabitRow({
  habit,
  onToggle,
  onEdit,
}: {
  habit: ResolvedHabit;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between rounded-lg border bg-card px-3 py-2 opacity-60">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-11 flex-1 items-center gap-2 pl-9 text-left"
      >
        <HabitIcon habit={habit} />
        <span className="truncate font-medium">{habit.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          ({KIND_LABELS[habit.valueKind]})
        </span>
      </button>
      <Switch
        checked={habit.isEnabled}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${habit.name}`}
      />
    </div>
  );
}

export function HabitsSettings() {
  const {
    getAllHabits,
    getEnabledHabits,
    toggleHabit,
    reorderHabits,
    v2Available,
    isLoading,
  } = useHabitPreferencesContext();

  // string = editing that key; "new" = creating; null = closed
  const [editorTarget, setEditorTarget] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const allHabits = getAllHabits();
  const enabledHabits = getEnabledHabits();
  const disabledHabits = allHabits.filter((h) => !h.isEnabled);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = enabledHabits.findIndex((h) => h.key === active.id);
      const newIndex = enabledHabits.findIndex((h) => h.key === over.id);
      const newOrder = arrayMove(enabledHabits, oldIndex, newIndex);
      reorderHabits(newOrder.map((h) => h.key));
    }
  };

  const activeHabit = activeId
    ? enabledHabits.find((h) => h.key === activeId)
    : null;
  const editingHabit =
    editorTarget && editorTarget !== "new"
      ? allHabits.find((h) => h.key === editorTarget) ?? null
      : null;

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 text-center">
        <span className="text-sm text-muted-foreground">Loading habits...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {v2Available ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditorTarget("new")}
          className="h-11 w-full border-dashed"
        >
          <Plus className="h-4 w-4" />
          New Habit
        </Button>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Custom habits, 1-5 scales, and choice types unlock once{" "}
          <code>sql/add_habits_v2.sql</code> is applied in Supabase. Until then
          the built-in list below works as before.
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Tracked Habits</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Drag to reorder. Tap a habit to edit it.
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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={enabledHabits.map((h) => h.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {enabledHabits.map((habit) => (
                  <SortableHabitRow
                    key={habit.key}
                    habit={habit}
                    onToggle={(enabled) => toggleHabit(habit.key, enabled)}
                    onEdit={() => setEditorTarget(habit.key)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeHabit ? (
                <div className="flex min-h-[52px] items-center justify-between rounded-lg border bg-card px-3 py-2 shadow-lg">
                  <div className="flex items-center gap-1">
                    <div className="p-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <HabitIcon habit={activeHabit} />
                    <span className="font-medium">{activeHabit.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({KIND_LABELS[activeHabit.valueKind]})
                    </span>
                  </div>
                  <Switch checked={activeHabit.isEnabled} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {disabledHabits.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Available Habits</h3>
          <div className="space-y-2">
            {disabledHabits.map((habit) => (
              <DisabledHabitRow
                key={habit.key}
                habit={habit}
                onToggle={(enabled) => toggleHabit(habit.key, enabled)}
                onEdit={() => setEditorTarget(habit.key)}
              />
            ))}
          </div>
        </div>
      )}

      {editorTarget && (
        <HabitEditorDialog
          key={editorTarget}
          habit={editingHabit}
          open
          onOpenChange={(open) => !open && setEditorTarget(null)}
        />
      )}
    </div>
  );
}
