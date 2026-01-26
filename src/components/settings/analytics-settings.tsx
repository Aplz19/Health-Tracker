"use client";

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
import { GripVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAnalyticsPreferencesContext } from "@/contexts/analytics-preferences-context";
import type { UserMetric, MetricCategory } from "@/types/analytics";

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  nutrition: "Nutrition",
  whoop: "Whoop",
  exercise: "Exercise",
  supplements: "Supplements",
  habits: "Habits",
};

// Sortable metric row for enabled metrics
function SortableMetricRow({
  metric,
  onToggle,
}: {
  metric: UserMetric;
  onToggle: (enabled: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metric.definition.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = metric.definition.icon;

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
        <Icon className="h-5 w-5" style={{ color: metric.definition.color }} />
        <span className="font-medium">{metric.definition.label}</span>
        <span className="text-xs text-muted-foreground">
          ({CATEGORY_LABELS[metric.definition.category]})
        </span>
      </div>
      <Switch checked={metric.isEnabled} onCheckedChange={onToggle} />
    </div>
  );
}

// Regular metric row for disabled metrics
function MetricRow({
  metric,
  onToggle,
}: {
  metric: UserMetric;
  onToggle: (enabled: boolean) => void;
}) {
  const Icon = metric.definition.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 opacity-60">
      <div className="flex items-center gap-2 pl-7">
        <Icon className="h-5 w-5" style={{ color: metric.definition.color }} />
        <span className="font-medium">{metric.definition.label}</span>
        <span className="text-xs text-muted-foreground">
          ({CATEGORY_LABELS[metric.definition.category]})
        </span>
      </div>
      <Switch checked={metric.isEnabled} onCheckedChange={onToggle} />
    </div>
  );
}

export function AnalyticsSettings() {
  const {
    getAllMetrics,
    getEnabledMetrics,
    toggleMetric,
    reorderMetrics,
    isLoading,
  } = useAnalyticsPreferencesContext();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const allMetrics = getAllMetrics();
  const enabledMetrics = getEnabledMetrics();
  const disabledMetrics = allMetrics.filter((m) => !m.isEnabled);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = enabledMetrics.findIndex(
        (m) => m.definition.key === active.id
      );
      const newIndex = enabledMetrics.findIndex(
        (m) => m.definition.key === over.id
      );

      const newOrder = arrayMove(enabledMetrics, oldIndex, newIndex);
      reorderMetrics(newOrder.map((m) => m.definition.key));
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 text-center">
        <span className="text-sm text-muted-foreground">Loading metrics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Displayed Metrics</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Drag to reorder. Toggle to show/hide metrics on your analytics dashboard.
        </p>

        {enabledMetrics.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No metrics enabled. Toggle metrics below to display them.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={enabledMetrics.map((m) => m.definition.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {enabledMetrics.map((metric) => (
                  <SortableMetricRow
                    key={metric.definition.key}
                    metric={metric}
                    onToggle={(enabled) =>
                      toggleMetric(metric.definition.key, enabled)
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {disabledMetrics.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Available Metrics</h3>
          <div className="space-y-2">
            {disabledMetrics.map((metric) => (
              <MetricRow
                key={metric.definition.key}
                metric={metric}
                onToggle={(enabled) =>
                  toggleMetric(metric.definition.key, enabled)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
