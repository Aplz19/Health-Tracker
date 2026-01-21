"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_OPTIONS } from "@/lib/exercise-categories";
import type { Exercise, ExerciseCategory, ExerciseInsert } from "@/lib/supabase/types";

interface AddExerciseFormProps {
  editingExercise: Exercise | null;
  defaultCategory?: ExerciseCategory;
  onSubmit: (data: Omit<ExerciseInsert, "user_id">) => Promise<void>;
  onCancel: () => void;
}

export function AddExerciseForm({
  editingExercise,
  defaultCategory,
  onSubmit,
  onCancel,
}: AddExerciseFormProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | null>(defaultCategory || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingExercise) {
      setName(editingExercise.name);
      setCategory(editingExercise.category);
    } else {
      setName("");
      setCategory(defaultCategory || null);
    }
  }, [editingExercise, defaultCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !category) return;

    setIsSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), category });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Exercise Name</Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Barbell Curl"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                category === cat.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 border-muted hover:bg-muted"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!name.trim() || !category || isSubmitting}
        >
          {isSubmitting ? "Saving..." : editingExercise ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}
