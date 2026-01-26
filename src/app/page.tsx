import { DateProvider } from "@/contexts/date-context";
import { AppProvider } from "@/contexts/app-context";
import { SupplementPreferencesProvider } from "@/contexts/supplement-preferences-context";
import { HabitPreferencesProvider } from "@/contexts/habit-preferences-context";
import { AppContent } from "@/components/layout/app-content";

export default function Home() {
  return (
    <SupplementPreferencesProvider>
      <HabitPreferencesProvider>
        <AppProvider>
          <DateProvider>
            <AppContent />
          </DateProvider>
        </AppProvider>
      </HabitPreferencesProvider>
    </SupplementPreferencesProvider>
  );
}
