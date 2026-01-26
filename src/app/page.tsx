import { AuthProvider } from "@/contexts/auth-context";
import { DateProvider } from "@/contexts/date-context";
import { AppProvider } from "@/contexts/app-context";
import { SupplementPreferencesProvider } from "@/contexts/supplement-preferences-context";
import { HabitPreferencesProvider } from "@/contexts/habit-preferences-context";
import { AnalyticsPreferencesProvider } from "@/contexts/analytics-preferences-context";
import { AppContent } from "@/components/layout/app-content";

export default function Home() {
  return (
    <AuthProvider>
      <SupplementPreferencesProvider>
        <HabitPreferencesProvider>
          <AnalyticsPreferencesProvider>
            <AppProvider>
              <DateProvider>
                <AppContent />
              </DateProvider>
            </AppProvider>
          </AnalyticsPreferencesProvider>
        </HabitPreferencesProvider>
      </SupplementPreferencesProvider>
    </AuthProvider>
  );
}
