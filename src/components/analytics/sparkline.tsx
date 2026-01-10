"use client";

import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  showArea?: boolean;
}

export function Sparkline({
  data,
  color = "#3b82f6",
  height = 40,
  width = 100,
  showArea = true,
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length === 0) return "";

    const validData = data.map(v => (isNaN(v) || v === null ? 0 : v));
    const max = Math.max(...validData, 1);
    const min = Math.min(...validData, 0);
    const range = max - min || 1;

    const points = validData.map((value, index) => {
      const x = (index / (validData.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    });

    return `M${points.join(" L")}`;
  }, [data, height, width]);

  const areaPath = useMemo(() => {
    if (data.length === 0 || !showArea) return "";

    const validData = data.map(v => (isNaN(v) || v === null ? 0 : v));
    const max = Math.max(...validData, 1);
    const min = Math.min(...validData, 0);
    const range = max - min || 1;

    const points = validData.map((value, index) => {
      const x = (index / (validData.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    });

    return `M0,${height} L${points.join(" L")} L${width},${height} Z`;
  }, [data, height, width, showArea]);

  if (data.length === 0) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      </svg>
    );
  }

  return (
    <svg width={width} height={height}>
      {showArea && (
        <path
          d={areaPath}
          fill={color}
          fillOpacity={0.1}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
