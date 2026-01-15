"use client";

import { useState } from "react";
import { WhoopStep } from "./whoop-step";
import { SupplementsStep } from "./supplements-step";
import { HabitsStep } from "./habits-step";
import { supabase } from "@/lib/supabase/client";

interface OnboardingFlowProps {
  userId: string;
  onComplete: () => void;
}

export function OnboardingFlow({ userId, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const totalSteps = 3;

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleSkip = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const completeOnboarding = async () => {
    // Mark onboarding as complete
    await supabase
      .from("user_profiles")
      .upsert({
        user_id: userId,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center py-8">
        <div className="w-full max-w-2xl mx-auto px-6">
          {/* Progress indicator */}
          <div className="flex justify-center gap-2 mb-8">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-16 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="bg-card border rounded-xl p-8 shadow-lg">
            {step === 0 && (
              <WhoopStep onNext={handleNext} onSkip={handleSkip} />
            )}
            {step === 1 && (
              <SupplementsStep onNext={handleNext} onSkip={handleSkip} />
            )}
            {step === 2 && (
              <HabitsStep onNext={handleNext} onSkip={handleSkip} isLastStep />
            )}
          </div>

          {/* Step counter */}
          <p className="text-center text-sm text-muted-foreground mt-4">
            Step {step + 1} of {totalSteps}
          </p>
        </div>
      </div>
    </div>
  );
}
