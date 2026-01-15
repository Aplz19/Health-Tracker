"use client";

import { useAuth } from "@/contexts/auth-context";
import { Header } from "@/components/layout/header";
import { TabNavigation } from "@/components/layout/tab-navigation";
import { FoodLibraryOverlay } from "@/components/food/food-library-overlay";
import { ExerciseLibraryOverlay } from "@/components/exercise/exercise-library-overlay";
import { SupplementLibraryOverlay } from "@/components/supplement/supplement-library-overlay";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export function AppContent() {
  const { user, isLoading, onboardingCompleted, completeOnboarding } = useAuth();

  // Still loading auth state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Not logged in - will be redirected by middleware
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Redirecting to login...</div>
      </div>
    );
  }

  // User hasn't completed onboarding
  if (onboardingCompleted === false) {
    return (
      <OnboardingFlow
        userId={user.id}
        onComplete={completeOnboarding}
      />
    );
  }

  // Still checking onboarding status
  if (onboardingCompleted === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Normal app view
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-screen-md mx-auto">
        <TabNavigation />
      </main>
      <FoodLibraryOverlay />
      <ExerciseLibraryOverlay />
      <SupplementLibraryOverlay />
    </div>
  );
}
