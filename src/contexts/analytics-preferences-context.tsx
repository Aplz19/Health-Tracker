"use client";

import { createContext, useContext, ReactNode } from "react";
import { useAnalyticsPreferences } from "@/hooks/use-analytics-preferences";
import type { MetricPreference, UserMetric } from "@/types/analytics";

interface AnalyticsPreferencesContextType {
  preferences: MetricPreference[];
  isLoading: boolean;
  error: string | null;
  getAllMetrics: () => UserMetric[];
  getEnabledMetrics: () => UserMetric[];
  toggleMetric: (key: string, enabled: boolean) => Promise<void>;
  reorderMetrics: (orderedKeys: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

const AnalyticsPreferencesContext = createContext<AnalyticsPreferencesContextType | null>(null);

export function AnalyticsPreferencesProvider({ children }: { children: ReactNode }) {
  const analyticsPreferences = useAnalyticsPreferences();

  return (
    <AnalyticsPreferencesContext.Provider value={analyticsPreferences}>
      {children}
    </AnalyticsPreferencesContext.Provider>
  );
}

export function useAnalyticsPreferencesContext() {
  const context = useContext(AnalyticsPreferencesContext);
  if (!context) {
    throw new Error(
      "useAnalyticsPreferencesContext must be used within AnalyticsPreferencesProvider"
    );
  }
  return context;
}
