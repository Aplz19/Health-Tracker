"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

interface AppContextType {
  isFoodLibraryOpen: boolean;
  openFoodLibrary: () => void;
  closeFoodLibrary: () => void;
  isExerciseLibraryOpen: boolean;
  openExerciseLibrary: () => void;
  closeExerciseLibrary: () => void;
  isSupplementLibraryOpen: boolean;
  openSupplementLibrary: () => void;
  closeSupplementLibrary: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isFoodLibraryOpen, setIsFoodLibraryOpen] = useState(false);
  const [isExerciseLibraryOpen, setIsExerciseLibraryOpen] = useState(false);
  const [isSupplementLibraryOpen, setIsSupplementLibraryOpen] = useState(false);

  const openFoodLibrary = useCallback(() => setIsFoodLibraryOpen(true), []);
  const closeFoodLibrary = useCallback(() => setIsFoodLibraryOpen(false), []);
  const openExerciseLibrary = useCallback(() => setIsExerciseLibraryOpen(true), []);
  const closeExerciseLibrary = useCallback(() => setIsExerciseLibraryOpen(false), []);
  const openSupplementLibrary = useCallback(() => setIsSupplementLibraryOpen(true), []);
  const closeSupplementLibrary = useCallback(() => setIsSupplementLibraryOpen(false), []);

  const value = useMemo(
    () => ({
      isFoodLibraryOpen,
      openFoodLibrary,
      closeFoodLibrary,
      isExerciseLibraryOpen,
      openExerciseLibrary,
      closeExerciseLibrary,
      isSupplementLibraryOpen,
      openSupplementLibrary,
      closeSupplementLibrary,
    }),
    [
      isFoodLibraryOpen,
      openFoodLibrary,
      closeFoodLibrary,
      isExerciseLibraryOpen,
      openExerciseLibrary,
      closeExerciseLibrary,
      isSupplementLibraryOpen,
      openSupplementLibrary,
      closeSupplementLibrary,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
