"use client";

import { createContext, useContext, ReactNode } from "react";
import { useSupplementPreferences } from "@/hooks/use-supplement-preferences";
import type { SupplementPreference, UserSupplement } from "@/types/supplements";

interface SupplementPreferencesContextType {
  preferences: SupplementPreference[];
  isLoading: boolean;
  error: string | null;
  getAllSupplements: () => UserSupplement[];
  getEnabledSupplements: () => UserSupplement[];
  toggleSupplement: (key: string, enabled: boolean) => Promise<void>;
  setTrackingMode: (key: string, mode: "manual" | "goal") => Promise<void>;
  setGoalAmount: (key: string, amount: number) => Promise<void>;
  reorderSupplements: (orderedKeys: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

const SupplementPreferencesContext = createContext<SupplementPreferencesContextType | null>(null);

export function SupplementPreferencesProvider({ children }: { children: ReactNode }) {
  const supplementPreferences = useSupplementPreferences();

  return (
    <SupplementPreferencesContext.Provider value={supplementPreferences}>
      {children}
    </SupplementPreferencesContext.Provider>
  );
}

export function useSupplementPreferencesContext() {
  const context = useContext(SupplementPreferencesContext);
  if (!context) {
    throw new Error(
      "useSupplementPreferencesContext must be used within SupplementPreferencesProvider"
    );
  }
  return context;
}
