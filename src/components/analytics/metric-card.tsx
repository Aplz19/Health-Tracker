"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Sparkline } from "./sparkline";
import { calculateStats } from "@/hooks/use-analytics";

interface MetricCardProps {
  title: string;
  data: number[];
  unit?: string;
  color: string;
  decimals?: number;
  onClick?: () => void;
}

export function MetricCard({
  title,
  data,
  unit = "",
  color,
  decimals = 0,
  onClick,
}: MetricCardProps) {
  const stats = calculateStats(data);

  const formatValue = (value: number) => {
    if (decimals > 0) {
      return value.toFixed(decimals);
    }
    return Math.round(value).toLocaleString();
  };

  const TrendIcon = stats.trend > 2
    ? TrendingUp
    : stats.trend < -2
    ? TrendingDown
    : Minus;

  const trendColor = stats.trend > 2
    ? "text-green-500"
    : stats.trend < -2
    ? "text-red-500"
    : "text-muted-foreground";

  return (
    <button
      onClick={onClick}
      className="w-full p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold" style={{ color }}>
              {formatValue(stats.average)}
            </span>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          <span>{Math.abs(stats.trend).toFixed(0)}%</span>
        </div>
      </div>

      <Sparkline data={data} color={color} width={140} height={36} />

      <div className="flex justify-between mt-3 text-xs text-muted-foreground">
        <span>Min: {formatValue(stats.min)}{unit}</span>
        <span>Max: {formatValue(stats.max)}{unit}</span>
      </div>
    </button>
  );
}
