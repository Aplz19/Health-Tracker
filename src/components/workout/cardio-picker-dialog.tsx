"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CARDIO_EXERCISES, type CardioExerciseType } from "@/lib/supabase/types";
import { Footprints } from "lucide-react";

interface CardioPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseType: CardioExerciseType) => void;
}

export function CardioPickerDialog({
  open,
  onClose,
  onSelect,
}: CardioPickerDialogProps) {
  const handleSelect = (type: CardioExerciseType) => {
    onSelect(type);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Cardio Exercise</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {CARDIO_EXERCISES.map((exercise) => (
            <Button
              key={exercise.type}
              variant="outline"
              className="w-full justify-start h-auto py-3"
              onClick={() => handleSelect(exercise.type)}
            >
              <Footprints className="h-5 w-5 mr-3 text-blue-500" />
              <span>{exercise.name}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
