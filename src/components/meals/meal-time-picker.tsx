"use client";

import { useState, useEffect } from "react";

interface MealTimePickerProps {
  hour: number;
  minute: number;
  isPm: boolean;
  onChange: (hour: number, minute: number, isPm: boolean) => void;
}

export function MealTimePicker({
  hour,
  minute,
  isPm,
  onChange,
}: MealTimePickerProps) {
  const [localHour, setLocalHour] = useState(hour);
  const [localMinute, setLocalMinute] = useState(minute);
  const [localIsPm, setLocalIsPm] = useState(isPm);

  // Sync with props
  useEffect(() => {
    setLocalHour(hour);
    setLocalMinute(minute);
    setLocalIsPm(isPm);
  }, [hour, minute, isPm]);

  const handleHourChange = (newHour: number) => {
    // Wrap around: 12 -> 1, 0 -> 12
    if (newHour > 12) newHour = 1;
    if (newHour < 1) newHour = 12;
    setLocalHour(newHour);
    onChange(newHour, localMinute, localIsPm);
  };

  const handleMinuteChange = (newMinute: number) => {
    // Wrap around: 59 -> 0, -1 -> 59
    if (newMinute > 59) newMinute = 0;
    if (newMinute < 0) newMinute = 59;
    setLocalMinute(newMinute);
    onChange(localHour, newMinute, localIsPm);
  };

  const toggleAmPm = () => {
    const newIsPm = !localIsPm;
    setLocalIsPm(newIsPm);
    onChange(localHour, localMinute, newIsPm);
  };

  const formatHour = (h: number) => h.toString().padStart(2, "0");
  const formatMinute = (m: number) => m.toString().padStart(2, "0");

  return (
    <div className="flex items-center gap-0.5 text-sm">
      {/* Hour */}
      <input
        type="number"
        value={formatHour(localHour)}
        onChange={(e) => {
          const val = parseInt(e.target.value) || 1;
          handleHourChange(Math.min(12, Math.max(1, val)));
        }}
        onBlur={() => {
          if (localHour < 1) handleHourChange(1);
          if (localHour > 12) handleHourChange(12);
        }}
        className="w-7 bg-transparent text-center focus:outline-none focus:bg-muted rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min={1}
        max={12}
      />
      <span className="text-muted-foreground">:</span>
      {/* Minute */}
      <input
        type="number"
        value={formatMinute(localMinute)}
        onChange={(e) => {
          const val = parseInt(e.target.value) || 0;
          handleMinuteChange(Math.min(59, Math.max(0, val)));
        }}
        onBlur={() => {
          if (localMinute < 0) handleMinuteChange(0);
          if (localMinute > 59) handleMinuteChange(59);
        }}
        className="w-7 bg-transparent text-center focus:outline-none focus:bg-muted rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min={0}
        max={59}
      />
      {/* AM/PM Toggle */}
      <button
        type="button"
        onClick={toggleAmPm}
        className="ml-1 px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-xs font-medium transition-colors"
      >
        {localIsPm ? "pm" : "am"}
      </button>
    </div>
  );
}
