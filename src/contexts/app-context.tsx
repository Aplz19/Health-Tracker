"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface AppContextType {
  isFoodLibraryOpen: boolean;
  openFoodLibrary: () => void;
  closeFoodLibrary: () => void;
  isExerciseLibraryOpen: boolean;
  openExerciseLibrary: () => void;
  closeExerciseLibrary: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isFoodLibraryOpen, setIsFoodLibraryOpen] = useState(false);
  const [isExerciseLibraryOpen, setIsExerciseLibraryOpen] = useState(false);

  const openFoodLibrary = () => setIsFoodLibraryOpen(true);
  const closeFoodLibrary = () => setIsFoodLibraryOpen(false);
  const openExerciseLibrary = () => setIsExerciseLibraryOpen(true);
  const closeExerciseLibrary = () => setIsExerciseLibraryOpen(false);

  return (
    <AppContext.Provider
      value={{
        isFoodLibraryOpen,
        openFoodLibrary,
        closeFoodLibrary,
        isExerciseLibraryOpen,
        openExerciseLibrary,
        closeExerciseLibrary,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
