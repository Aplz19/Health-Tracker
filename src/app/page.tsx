import { AuthProvider } from "@/contexts/auth-context";
import { DateProvider } from "@/contexts/date-context";
import { AppProvider } from "@/contexts/app-context";
import { SupplementPreferencesProvider } from "@/contexts/supplement-preferences-context";
import { AppContent } from "@/components/layout/app-content";

export default function Home() {
  return (
    <AuthProvider>
      <SupplementPreferencesProvider>
        <AppProvider>
          <DateProvider>
            <AppContent />
          </DateProvider>
        </AppProvider>
      </SupplementPreferencesProvider>
    </AuthProvider>
  );
}
