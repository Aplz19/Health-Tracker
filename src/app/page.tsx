import { DateProvider } from "@/contexts/date-context";
import { AppProvider } from "@/contexts/app-context";
import { Header } from "@/components/layout/header";
import { TabNavigation } from "@/components/layout/tab-navigation";
import { FoodLibraryOverlay } from "@/components/food/food-library-overlay";
import { ExerciseLibraryOverlay } from "@/components/exercise/exercise-library-overlay";

export default function Home() {
  return (
    <AppProvider>
      <DateProvider>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container max-w-screen-md mx-auto">
            <TabNavigation />
          </main>
          <FoodLibraryOverlay />
          <ExerciseLibraryOverlay />
        </div>
      </DateProvider>
    </AppProvider>
  );
}
