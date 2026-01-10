"use client";

import { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MetricCard } from "@/components/analytics/metric-card";
import { MetricDetailSheet } from "@/components/analytics/metric-detail-sheet";
import { useAnalytics, TIME_RANGE_OPTIONS, type TimeRange } from "@/hooks/use-analytics";

type MetricType =
  | "calories" | "protein" | "carbs" | "fat"
  | "recovery" | "hrv" | "rhr" | "sleepScore" | "sleepDuration" | "strain"
  | "creatine" | "workouts" | "volume";

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
  const { data, isLoading } = useAnalytics(timeRange);

  // Prepare all metric data
  const allMetricData = useMemo(() => ({
    calories: data.nutrition.map(d => ({ date: d.date, value: d.calories })),
    protein: data.nutrition.map(d => ({ date: d.date, value: d.protein })),
    carbs: data.nutrition.map(d => ({ date: d.date, value: d.carbs })),
    fat: data.nutrition.map(d => ({ date: d.date, value: d.fat })),
    recovery: data.whoop.filter(d => d.recovery !== null).map(d => ({ date: d.date, value: d.recovery! })),
    hrv: data.whoop.filter(d => d.hrv !== null).map(d => ({ date: d.date, value: d.hrv! })),
    rhr: data.whoop.filter(d => d.rhr !== null).map(d => ({ date: d.date, value: d.rhr! })),
    sleepScore: data.whoop.filter(d => d.sleepScore !== null).map(d => ({ date: d.date, value: d.sleepScore! })),
    sleepDuration: data.whoop.filter(d => d.sleepDuration !== null).map(d => ({ date: d.date, value: d.sleepDuration! / 60 })),
    strain: data.whoop.filter(d => d.strain !== null).map(d => ({ date: d.date, value: d.strain! })),
    creatine: data.creatine.map(d => ({ date: d.date, value: d.amount })),
    workouts: data.exercise.map(d => ({ date: d.date, value: d.workouts })),
    volume: data.exercise.map(d => ({ date: d.date, value: d.totalVolume })),
  }), [data]);

  const openMetric = (config: MetricConfig) => {
    setSelectedMetric(config);
  };

  // Get current data for selected metric
  const selectedMetricData = selectedMetric
    ? allMetricData[selectedMetric.type]
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
        <div className="p-4 space-y-6">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              Loading analytics...
            </div>
          ) : (
            <>
              {/* Nutrition Section */}
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Nutrition
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    title="Calories"
                    data={allMetricData.calories.map(d => d.value)}
                    color="#f97316"
                    onClick={() => openMetric({ type: "calories", title: "Calories", color: "#f97316", unit: " cal", decimals: 0 })}
                  />
                  <MetricCard
                    title="Protein"
                    data={allMetricData.protein.map(d => d.value)}
                    unit="g"
                    color="#3b82f6"
                    onClick={() => openMetric({ type: "protein", title: "Protein", color: "#3b82f6", unit: "g", decimals: 0 })}
                  />
                  <MetricCard
                    title="Carbs"
                    data={allMetricData.carbs.map(d => d.value)}
                    unit="g"
                    color="#22c55e"
                    onClick={() => openMetric({ type: "carbs", title: "Carbs", color: "#22c55e", unit: "g", decimals: 0 })}
                  />
                  <MetricCard
                    title="Fat"
                    data={allMetricData.fat.map(d => d.value)}
                    unit="g"
                    color="#eab308"
                    onClick={() => openMetric({ type: "fat", title: "Fat", color: "#eab308", unit: "g", decimals: 0 })}
                  />
                </div>
              </section>

              {/* Whoop Section */}
              {data.whoop.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Whoop
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard
                      title="Recovery"
                      data={allMetricData.recovery.map(d => d.value)}
                      unit="%"
                      color="#22c55e"
                      onClick={() => openMetric({ type: "recovery", title: "Recovery", color: "#22c55e", unit: "%", decimals: 0 })}
                    />
                    <MetricCard
                      title="HRV"
                      data={allMetricData.hrv.map(d => d.value)}
                      unit="ms"
                      color="#8b5cf6"
                      decimals={1}
                      onClick={() => openMetric({ type: "hrv", title: "HRV", color: "#8b5cf6", unit: "ms", decimals: 1 })}
                    />
                    <MetricCard
                      title="Resting HR"
                      data={allMetricData.rhr.map(d => d.value)}
                      unit="bpm"
                      color="#ef4444"
                      onClick={() => openMetric({ type: "rhr", title: "Resting Heart Rate", color: "#ef4444", unit: "bpm", decimals: 0 })}
                    />
                    <MetricCard
                      title="Strain"
                      data={allMetricData.strain.map(d => d.value)}
                      color="#f97316"
                      decimals={1}
                      onClick={() => openMetric({ type: "strain", title: "Strain", color: "#f97316", unit: "", decimals: 1 })}
                    />
                    <MetricCard
                      title="Sleep Score"
                      data={allMetricData.sleepScore.map(d => d.value)}
                      unit="%"
                      color="#6366f1"
                      onClick={() => openMetric({ type: "sleepScore", title: "Sleep Score", color: "#6366f1", unit: "%", decimals: 0 })}
                    />
                    <MetricCard
                      title="Sleep Duration"
                      data={allMetricData.sleepDuration.map(d => d.value)}
                      unit="hrs"
                      color="#0ea5e9"
                      decimals={1}
                      onClick={() => openMetric({ type: "sleepDuration", title: "Sleep Duration", color: "#0ea5e9", unit: "hrs", decimals: 1 })}
                    />
                  </div>
                </section>
              )}

              {/* Exercise Section */}
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Exercise
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    title="Workouts"
                    data={allMetricData.workouts.map(d => d.value)}
                    color="#ec4899"
                    onClick={() => openMetric({ type: "workouts", title: "Workouts", color: "#ec4899", unit: "", decimals: 0 })}
                  />
                  <MetricCard
                    title="Volume"
                    data={allMetricData.volume.map(d => d.value)}
                    unit="lbs"
                    color="#14b8a6"
                    onClick={() => openMetric({ type: "volume", title: "Total Volume", color: "#14b8a6", unit: "lbs", decimals: 0 })}
                  />
                </div>
              </section>

              {/* Supplements Section */}
              {data.creatine.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Supplements
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard
                      title="Creatine"
                      data={allMetricData.creatine.map(d => d.value)}
                      unit="g"
                      color="#a855f7"
                      onClick={() => openMetric({ type: "creatine", title: "Creatine", color: "#a855f7", unit: "g", decimals: 0 })}
                    />
                  </div>
                </section>
              )}
            </>
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
