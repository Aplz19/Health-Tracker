"use client";

import { useState } from "react";
import { Pill, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPLEMENT_DEFINITIONS } from "@/lib/supplements/config";
import { useSupplementPreferencesContext } from "@/contexts/supplement-preferences-context";

interface SupplementsStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function SupplementsStep({ onNext, onSkip }: SupplementsStepProps) {
  const { toggleSupplement, getAllSupplements } = useSupplementPreferencesContext();
  const allSupplements = getAllSupplements();

  // Start with nothing selected - user chooses fresh
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const handleToggle = (key: string) => {
    const newSelected = new Set(selectedKeys);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedKeys(newSelected);
  };

  const handleContinue = async () => {
    // Enable selected supplements, disable unselected
    for (const supplement of SUPPLEMENT_DEFINITIONS) {
      const shouldBeEnabled = selectedKeys.has(supplement.key);
      const currentlyEnabled = allSupplements.find(s => s.definition.key === supplement.key)?.isEnabled ?? false;

      if (shouldBeEnabled !== currentlyEnabled) {
        await toggleSupplement(supplement.key, shouldBeEnabled);
      }
    }
    onNext();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4">
          <Pill className="w-8 h-8 text-purple-500" />
        </div>
        <h1 className="text-2xl font-bold">What supplements do you take?</h1>
        <p className="text-muted-foreground">
          Select the supplements you want to track daily.
        </p>
      </div>

      {/* Supplement grid */}
      <div className="grid grid-cols-2 gap-3">
        {SUPPLEMENT_DEFINITIONS.map((supplement) => {
          const isSelected = selectedKeys.has(supplement.key);
          const Icon = supplement.icon;

          return (
            <button
              key={supplement.key}
              onClick={() => handleToggle(supplement.key)}
              className={`
                relative flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left
                ${isSelected
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                }
              `}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-primary" />
                </div>
              )}
              <Icon className={`w-5 h-5 ${supplement.color} shrink-0`} />
              <span className="font-medium text-sm truncate">{supplement.label}</span>
            </button>
          );
        })}
      </div>

      {/* Selection summary */}
      <p className="text-center text-sm text-muted-foreground">
        {selectedKeys.size === 0
          ? "No supplements selected"
          : `${selectedKeys.size} supplement${selectedKeys.size > 1 ? "s" : ""} selected`
        }
      </p>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
        <Button size="lg" onClick={handleContinue} className="gap-2">
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
