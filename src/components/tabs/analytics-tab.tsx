"use client";

import { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import dynamic from "next/dynamic";
import { MetricCard } from "@/components/analytics/metric-card";

// The detail sheet is the ONLY consumer of recharts (the heaviest chart dep)
// and only renders when a metric is tapped — keep it out of the main bundle.
const MetricDetailSheet = dynamic(
  () =>
    import("@/components/analytics/metric-detail-sheet").then(
      (m) => m.MetricDetailSheet
    ),
  { ssr: false }
);
import { useAnalytics, TIME_RANGE_OPTIONS, type TimeRange } from "@/hooks/use-analytics";
import { SUPPLEMENT_METRIC_KEYS } from "@/lib/analytics/config";
import { useAnalyticsPreferencesContext } from "@/contexts/analytics-preferences-context";

// Metric keys are no longer a closed set: nutrition/whoop/exercise keys are
// fixed, but supplement keys are generated from SUPPLEMENT_DEFINITIONS, so a
// new supplement adds a metric without touching this file. METRIC_DEFINITIONS
// in lib/analytics/config.ts is the source of truth for what exists.
type MetricType = string;

type MetricSeries = { date: string; value: number }[];

interface MetricConfig {
  type: MetricType;
  title: string;
  color: string;
  unit: string;
  decimals: number;
}

// Map to longer labels for the main analytics page
const TIME_RANGES = TIME_RANGE_OPTIONS.map(opt => ({
  ...opt,
  label: opt.value === "7d" ? "7 Days" : opt.value === "30d" ? "30 Days" : "90 Days",
}));

export function AnalyticsTab() {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [selectedMetric, setSelectedMetric] = useState<MetricConfig | null>(null);
  const { getEnabledMetrics, isLoading: prefsLoading } = useAnalyticsPreferencesContext();

  const enabledMetrics = getEnabledMetrics();

  // Only fetch supplement tables the user actually charts (one query each).
  const enabledSupplementKeys = useMemo(
    () =>
      enabledMetrics
        .map((m) => m.definition.key)
        .filter((key) => SUPPLEMENT_METRIC_KEYS.has(key)),
    [enabledMetrics]
  );

  const { data, isLoading } = useAnalytics(timeRange, enabledSupplementKeys);

  // Prepare all metric data
  const allMetricData: Record<string, MetricSeries> = useMemo(() => ({
    // Nutrition - Macros
    calories: data.nutrition.map(d => ({ date: d.date, value: d.calories })),
    protein: data.nutrition.map(d => ({ date: d.date, value: d.protein })),
    carbs: data.nutrition.map(d => ({ date: d.date, value: d.carbs })),
    fat: data.nutrition.map(d => ({ date: d.date, value: d.fat })),
    saturatedFat: data.nutrition.map(d => ({ date: d.date, value: d.saturatedFat })),
    transFat: data.nutrition.map(d => ({ date: d.date, value: d.transFat })),
    polyunsaturatedFat: data.nutrition.map(d => ({ date: d.date, value: d.polyunsaturatedFat })),
    monounsaturatedFat: data.nutrition.map(d => ({ date: d.date, value: d.monounsaturatedFat })),
    fiber: data.nutrition.map(d => ({ date: d.date, value: d.fiber })),
    sugar: data.nutrition.map(d => ({ date: d.date, value: d.sugar })),
    addedSugar: data.nutrition.map(d => ({ date: d.date, value: d.addedSugar })),
    sodium: data.nutrition.map(d => ({ date: d.date, value: d.sodium })),
    // Nutrition - Micronutrients are intentionally not charted; see
    // lib/analytics/config.ts. Track intake via the supplement metrics instead.
    // Whoop
    recovery: data.whoop.filter(d => d.recovery !== null).map(d => ({ date: d.date, value: d.recovery! })),
    hrv: data.whoop.filter(d => d.hrv !== null).map(d => ({ date: d.date, value: d.hrv! })),
    rhr: data.whoop.filter(d => d.rhr !== null).map(d => ({ date: d.date, value: d.rhr! })),
    sleepScore: data.whoop.filter(d => d.sleepScore !== null).map(d => ({ date: d.date, value: d.sleepScore! })),
    sleepDuration: data.whoop.filter(d => d.sleepDuration !== null).map(d => ({ date: d.date, value: d.sleepDuration! / 60 })),
    strain: data.whoop.filter(d => d.strain !== null).map(d => ({ date: d.date, value: d.strain! })),
    spo2: data.whoop.filter(d => d.spo2 !== null).map(d => ({ date: d.date, value: d.spo2! })),
    skinTemp: data.whoop.filter(d => d.skinTemp !== null).map(d => ({ date: d.date, value: d.skinTemp! })),
    kilojoules: data.whoop.filter(d => d.kilojoules !== null).map(d => ({ date: d.date, value: d.kilojoules! })),
    avgHeartRate: data.whoop.filter(d => d.avgHeartRate !== null).map(d => ({ date: d.date, value: d.avgHeartRate! })),
    maxHeartRate: data.whoop.filter(d => d.maxHeartRate !== null).map(d => ({ date: d.date, value: d.maxHeartRate! })),
    // Exercise
    workouts: data.exercise.map(d => ({ date: d.date, value: d.workouts })),
    volume: data.exercise.map(d => ({ date: d.date, value: d.totalVolume })),
    sets: data.exercise.map(d => ({ date: d.date, value: d.totalSets })),
    cardioSessions: data.cardio.map(d => ({ date: d.date, value: d.sessions })),
    cardioMinutes: data.cardio.map(d => ({ date: d.date, value: d.totalMinutes })),
    // Supplements — every tracked supplement, not just creatine. Each series
    // comes from that supplement's own _logs table in its own unit.
    ...Object.fromEntries(
      Object.entries(data.supplements).map(([key, rows]) => [
        key,
        rows.map((d) => ({ date: d.date, value: d.amount })),
      ])
    ),
  }), [data]);

  const openMetric = (config: MetricConfig) => {
    setSelectedMetric(config);
  };

  // Get current data for selected metric
  const selectedMetricData = selectedMetric
    ? allMetricData[selectedMetric.type] ?? []
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b bg-background">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Analytics</h2>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 hover:bg-muted"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Never let excluded days change the numbers silently. */}
          {!isLoading && data.excludedNutritionDates.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Nutrition excludes {data.excludedNutritionDates.length} day
              {data.excludedNutritionDates.length === 1 ? "" : "s"} marked
              incomplete.
            </p>
          )}
          {isLoading || prefsLoading ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              Loading analytics...
            </div>
          ) : enabledMetrics.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              No metrics enabled. Go to Settings → Analytics to choose metrics.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {enabledMetrics.map((metric) => {
                const key = metric.definition.key as MetricType;
                const metricData = allMetricData[key] || [];

                // Skip Whoop metrics if no Whoop data
                if (metric.definition.category === "whoop" && data.whoop.length === 0) {
                  return null;
                }

                // Skip any supplement with nothing logged in this range, rather
                // than showing a flat-zero card that looks broken.
                if (SUPPLEMENT_METRIC_KEYS.has(key) && metricData.length === 0) {
                  return null;
                }

                return (
                  <MetricCard
                    key={key}
                    title={metric.definition.label}
                    data={metricData.map(d => d.value)}
                    unit={metric.definition.unit.trim() || undefined}
                    color={metric.definition.color}
                    decimals={metric.definition.decimals}
                    onClick={() => openMetric({
                      type: key,
                      title: metric.definition.label,
                      color: metric.definition.color,
                      unit: metric.definition.unit,
                      decimals: metric.definition.decimals,
                    })}
                  />
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Metric Detail Sheet */}
      {selectedMetric && (
        <MetricDetailSheet
          open={!!selectedMetric}
          onOpenChange={(open) => !open && setSelectedMetric(null)}
          title={selectedMetric.title}
          data={selectedMetricData}
          color={selectedMetric.color}
          unit={selectedMetric.unit}
          decimals={selectedMetric.decimals}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />
      )}
    </div>
  );
}
