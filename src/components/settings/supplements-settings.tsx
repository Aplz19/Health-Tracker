"use client";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const SUPPLEMENTS = [
  { name: "Creatine", unit: "g", defaultAmount: 5 },
  { name: "Vitamin D3", unit: "IU", defaultAmount: 5000 },
  { name: "Vitamin K2", unit: "mcg", defaultAmount: 100 },
  { name: "Vitamin C", unit: "mg", defaultAmount: 1000 },
  { name: "Zinc", unit: "mg", defaultAmount: 15 },
  { name: "Magnesium", unit: "mg", defaultAmount: 400 },
  { name: "Melatonin", unit: "mg", defaultAmount: 3 },
  { name: "Caffeine", unit: "mg", defaultAmount: 200 },
];

export function SupplementsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Supplements</h3>
        <p className="text-sm text-muted-foreground">
          Configure your daily supplement targets.
        </p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {SUPPLEMENTS.map((supplement) => (
            <div key={supplement.name} className="flex flex-col gap-1">
              <Label className="text-sm font-medium">{supplement.name}</Label>
              <p className="text-xs text-muted-foreground">
                Target: {supplement.defaultAmount} {supplement.unit}
              </p>
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">Customization coming soon</Label>
          <p className="text-sm text-muted-foreground">
            You&apos;ll be able to add custom supplements and set personalized
            daily targets in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}
