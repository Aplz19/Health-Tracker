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
  // Store raw input strings to allow free editing
  const [hourInput, setHourInput] = useState(hour.toString().padStart(2, "0"));
  const [minuteInput, setMinuteInput] = useState(minute.toString().padStart(2, "0"));
  const [localIsPm, setLocalIsPm] = useState(isPm);

  // Sync with props when they change externally
  useEffect(() => {
    setHourInput(hour.toString().padStart(2, "0"));
    setMinuteInput(minute.toString().padStart(2, "0"));
    setLocalIsPm(isPm);
  }, [hour, minute, isPm]);

  const commitHour = (value: string) => {
    let num = parseInt(value) || 12;
    // Clamp to valid 12-hour range
    if (num < 1) num = 1;
    if (num > 12) num = 12;
    setHourInput(num.toString().padStart(2, "0"));
    onChange(num, parseInt(minuteInput) || 0, localIsPm);
  };

  const commitMinute = (value: string) => {
    let num = parseInt(value) || 0;
    // Clamp to valid minute range
    if (num < 0) num = 0;
    if (num > 59) num = 59;
    setMinuteInput(num.toString().padStart(2, "0"));
    onChange(parseInt(hourInput) || 12, num, localIsPm);
  };

  const toggleAmPm = () => {
    const newIsPm = !localIsPm;
    setLocalIsPm(newIsPm);
    onChange(parseInt(hourInput) || 12, parseInt(minuteInput) || 0, newIsPm);
  };

  return (
    <div className="flex items-center gap-0.5 text-sm">
      {/* Hour */}
      <input
        type="text"
        inputMode="numeric"
        value={hourInput}
        onChange={(e) => {
          // Only allow digits, max 2 chars
          const val = e.target.value.replace(/\D/g, "").slice(0, 2);
          setHourInput(val);
        }}
        onBlur={(e) => commitHour(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-7 bg-transparent text-center focus:outline-none focus:bg-muted rounded"
      />
      <span className="text-muted-foreground">:</span>
      {/* Minute */}
      <input
        type="text"
        inputMode="numeric"
        value={minuteInput}
        onChange={(e) => {
          // Only allow digits, max 2 chars
          const val = e.target.value.replace(/\D/g, "").slice(0, 2);
          setMinuteInput(val);
        }}
        onBlur={(e) => commitMinute(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-7 bg-transparent text-center focus:outline-none focus:bg-muted rounded"
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
