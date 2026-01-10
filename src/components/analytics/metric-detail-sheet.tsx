"use client";

import { format, parseISO } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { calculateStats, TIME_RANGE_OPTIONS, type TimeRange } from "@/hooks/use-analytics";

interface DataPoint {
  date: string;
  value: number;
}


interface MetricDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: DataPoint[];
  color: string;
  unit?: string;
  decimals?: number;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
}

export function MetricDetailSheet({
  open,
  onOpenChange,
  title,
  data,
  color,
  unit = "",
  decimals = 0,
  timeRange = "7d",
  onTimeRangeChange,
}: MetricDetailSheetProps) {
  const values = data.map(d => d.value);
  const stats = calculateStats(values);

  const formatValue = (value: number) => {
    if (decimals > 0) {
      return value.toFixed(decimals);
    }
    return Math.round(value).toLocaleString();
  };

  const chartData = data.map(d => ({
    date: d.date,
    value: d.value,
    label: format(parseISO(d.date), "MMM d"),
  }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle>{title}</SheetTitle>
            {onTimeRangeChange && (
              <div className="flex gap-1">
                {TIME_RANGE_OPTIONS.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => onTimeRangeChange(range.value)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      timeRange === range.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetHeader>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-lg font-bold" style={{ color }}>
              {formatValue(stats.average)}
            </p>
            <p className="text-xs text-muted-foreground">Average</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-lg font-bold">
              {formatValue(stats.current)}
            </p>
            <p className="text-xs text-muted-foreground">Current</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-lg font-bold text-green-500">
              {formatValue(stats.max)}
            </p>
            <p className="text-xs text-muted-foreground">High</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-lg font-bold text-red-500">
              {formatValue(stats.min)}
            </p>
            <p className="text-xs text-muted-foreground">Low</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatValue(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                formatter={(value) => [`${formatValue(value as number)}${unit}`, title]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#gradient-${title})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Info */}
        <div className="mt-6 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Period Trend</span>
            <span
              className={`text-sm font-bold ${
                stats.trend > 0 ? "text-green-500" : stats.trend < 0 ? "text-red-500" : ""
              }`}
            >
              {stats.trend > 0 ? "+" : ""}
              {stats.trend.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Comparing first half to second half of the period
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
