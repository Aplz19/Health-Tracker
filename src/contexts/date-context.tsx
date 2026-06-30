"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

interface DateContextType {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  goToToday: () => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

export function DateProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const goToToday = useCallback(() => setSelectedDate(new Date()), []);

  const goToPreviousDay = useCallback(() => {
    setSelectedDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  }, []);

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  }, []);

  const value = useMemo(
    () => ({
      selectedDate,
      setSelectedDate,
      goToToday,
      goToPreviousDay,
      goToNextDay,
    }),
    [selectedDate, goToToday, goToPreviousDay, goToNextDay]
  );

  return <DateContext.Provider value={value}>{children}</DateContext.Provider>;
}

export function useDate() {
  const context = useContext(DateContext);
  if (context === undefined) {
    throw new Error("useDate must be used within a DateProvider");
  }
  return context;
}
