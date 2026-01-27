"use client";

interface MacroCircleProps {
  label: string;
  current: number;
  goal: number;
  unit?: string;
  color: string;
  size?: number;
}

export function MacroCircle({
  label,
  current,
  goal,
  unit = "",
  color,
  size = 70,
}: MacroCircleProps) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate percentages
  const totalPercentage = goal > 0 ? (current / goal) * 100 : 0;
  const basePercentage = Math.min(totalPercentage, 100);
  const overPercentage = Math.max(totalPercentage - 100, 0);

  // Cap overflow at 100% (so max is 200% total = full circle of overflow)
  const cappedOverPercentage = Math.min(overPercentage, 100);

  const baseStrokeDashoffset = circumference - (basePercentage / 100) * circumference;
  const overStrokeDashoffset = circumference - (cappedOverPercentage / 100) * circumference;

  const isOver = current > goal;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="absolute inset-0 -rotate-90"
          width={size}
          height={size}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          {/* Base progress circle (normal color, up to 100%) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={baseStrokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
          {/* Overflow circle (red, shows amount over 100%) */}
          {isOver && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#ef4444"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={overStrokeDashoffset}
              className="transition-all duration-500 ease-out"
            />
          )}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-semibold ${isOver ? "text-red-500" : ""}`}>
            {Math.round(current)}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
    </div>
  );
}
