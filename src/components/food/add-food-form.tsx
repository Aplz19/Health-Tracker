"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Food, FoodInsert } from "@/lib/supabase/types";

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
  step?: string;
  indent?: boolean;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  required = false,
  step = "0.1",
  indent = false,
}: NumberFieldProps) {
  return (
    <div className={indent ? "pl-4 border-l-2 border-muted" : ""}>
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        min={0}
        step={step}
        required={required}
        className="h-9"
        placeholder="0"
      />
    </div>
  );
}

interface AddFoodFormProps {
  editingFood: Food | null;
  onSubmit: (data: FoodInsert) => Promise<void>;
}

const initialFormData: FoodInsert = {
  name: "",
  serving_size: "",
  serving_size_grams: null,
  calories: 0,
  protein: 0,
  total_fat: 0,
  saturated_fat: 0,
  trans_fat: 0,
  polyunsaturated_fat: 0,
  monounsaturated_fat: 0,
  sodium: 0,
  total_carbohydrates: 0,
  fiber: 0,
  sugar: 0,
  added_sugar: 0,
  vitamin_a: 0,
  vitamin_c: 0,
  vitamin_d: 0,
  calcium: 0,
  iron: 0,
  fdc_id: null,
  barcode: null,
  source: "manual",
};

function foodToFormData(food: Food): FoodInsert {
  return {
    name: food.name,
    serving_size: food.serving_size,
    serving_size_grams: food.serving_size_grams,
    calories: food.calories,
    protein: food.protein,
    total_fat: food.total_fat,
    saturated_fat: food.saturated_fat ?? 0,
    trans_fat: food.trans_fat ?? 0,
    polyunsaturated_fat: food.polyunsaturated_fat ?? 0,
    monounsaturated_fat: food.monounsaturated_fat ?? 0,
    sodium: food.sodium ?? 0,
    total_carbohydrates: food.total_carbohydrates,
    fiber: food.fiber ?? 0,
    sugar: food.sugar ?? 0,
    added_sugar: food.added_sugar ?? 0,
    vitamin_a: food.vitamin_a ?? 0,
    vitamin_c: food.vitamin_c ?? 0,
    vitamin_d: food.vitamin_d ?? 0,
    calcium: food.calcium ?? 0,
    iron: food.iron ?? 0,
    fdc_id: food.fdc_id,
    barcode: food.barcode,
    source: food.source,
  };
}

export function AddFoodForm({ editingFood, onSubmit }: AddFoodFormProps) {
  const [formData, setFormData] = useState<FoodInsert>(
    editingFood ? foodToFormData(editingFood) : initialFormData
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!editingFood;

  useEffect(() => {
    if (editingFood) {
      setFormData(foodToFormData(editingFood));
    } else {
      setFormData(initialFormData);
    }
  }, [editingFood]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setFormData(initialFormData);
    } catch {
      // Error is handled by the parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof FoodInsert, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-6">
      {/* Basic Info */}
      <section className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Basic Info
        </h3>
        <div>
          <Label htmlFor="name">Food Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="e.g., Chicken Breast"
            required
            className="h-9"
          />
        </div>
        <div>
          <Label htmlFor="serving_size">Serving Size *</Label>
          <Input
            id="serving_size"
            value={formData.serving_size}
            onChange={(e) => updateField("serving_size", e.target.value)}
            placeholder="e.g., 100g, 1 cup, 1 scoop"
            required
            className="h-9"
          />
        </div>
        <NumberField
          id="calories"
          label="Calories *"
          value={formData.calories}
          onChange={(v) => updateField("calories", v)}
          required
          step="1"
        />
      </section>

      <Separator />

      {/* Macronutrients */}
      <section className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Macronutrients
        </h3>

        <NumberField
          id="protein"
          label="Protein (g)"
          value={formData.protein}
          onChange={(v) => updateField("protein", v)}
        />

        <div className="space-y-2">
          <NumberField
            id="total_fat"
            label="Total Fat (g)"
            value={formData.total_fat}
            onChange={(v) => updateField("total_fat", v)}
          />
          <div className="space-y-2 ml-2">
            <NumberField
              id="saturated_fat"
              label="Saturated Fat (g)"
              value={formData.saturated_fat ?? 0}
              onChange={(v) => updateField("saturated_fat", v)}
              indent
            />
            <NumberField
              id="trans_fat"
              label="Trans Fat (g)"
              value={formData.trans_fat ?? 0}
              onChange={(v) => updateField("trans_fat", v)}
              indent
            />
            <NumberField
              id="polyunsaturated_fat"
              label="Polyunsaturated Fat (g)"
              value={formData.polyunsaturated_fat ?? 0}
              onChange={(v) => updateField("polyunsaturated_fat", v)}
              indent
            />
            <NumberField
              id="monounsaturated_fat"
              label="Monounsaturated Fat (g)"
              value={formData.monounsaturated_fat ?? 0}
              onChange={(v) => updateField("monounsaturated_fat", v)}
              indent
            />
          </div>
        </div>

        <div className="space-y-2">
          <NumberField
            id="total_carbohydrates"
            label="Total Carbohydrates (g)"
            value={formData.total_carbohydrates}
            onChange={(v) => updateField("total_carbohydrates", v)}
          />
          <div className="space-y-2 ml-2">
            <NumberField
              id="fiber"
              label="Fiber (g)"
              value={formData.fiber ?? 0}
              onChange={(v) => updateField("fiber", v)}
              indent
            />
            <NumberField
              id="sugar"
              label="Sugar (g)"
              value={formData.sugar ?? 0}
              onChange={(v) => updateField("sugar", v)}
              indent
            />
            <NumberField
              id="added_sugar"
              label="Added Sugar (g)"
              value={formData.added_sugar ?? 0}
              onChange={(v) => updateField("added_sugar", v)}
              indent
            />
          </div>
        </div>

        <NumberField
          id="sodium"
          label="Sodium (mg)"
          value={formData.sodium ?? 0}
          onChange={(v) => updateField("sodium", v)}
          step="1"
        />
      </section>

      <Separator />

      {/* Vitamins & Minerals */}
      <section className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Vitamins & Minerals
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="vitamin_a"
            label="Vitamin A (%DV)"
            value={formData.vitamin_a ?? 0}
            onChange={(v) => updateField("vitamin_a", v)}
            step="1"
          />
          <NumberField
            id="vitamin_c"
            label="Vitamin C (%DV)"
            value={formData.vitamin_c ?? 0}
            onChange={(v) => updateField("vitamin_c", v)}
            step="1"
          />
          <NumberField
            id="vitamin_d"
            label="Vitamin D (%DV)"
            value={formData.vitamin_d ?? 0}
            onChange={(v) => updateField("vitamin_d", v)}
            step="1"
          />
          <NumberField
            id="calcium"
            label="Calcium (%DV)"
            value={formData.calcium ?? 0}
            onChange={(v) => updateField("calcium", v)}
            step="1"
          />
          <NumberField
            id="iron"
            label="Iron (%DV)"
            value={formData.iron ?? 0}
            onChange={(v) => updateField("iron", v)}
            step="1"
          />
        </div>
      </section>

      <Separator />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : isEditing ? "Update Food" : "Save Food"}
      </Button>
    </form>
  );
}
