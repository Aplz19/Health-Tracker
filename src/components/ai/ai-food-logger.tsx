'use client';

import { useState } from 'react';
import { Send, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VoiceInput } from './voice-input';

interface ParsedFoodItem {
  food_name: string;
  amount: number;
  unit: string;
}

interface FoodMatch {
  id: string;
  name: string;
  serving_size: string;
  serving_size_grams: number;
  calories: number;
  protein: number;
  total_fat: number;
  total_carbohydrates: number;
  similarity: number;
}

interface FoodResultWithParsed {
  parsed: ParsedFoodItem;
  matches: FoodMatch[];
}

interface SelectedFood {
  parsed: ParsedFoodItem;
  match: FoodMatch;
}

interface AIFoodLoggerProps {
  userId: string;
  onFoodSelected: (food: FoodMatch, amount: number, unit: string, mealType?: string) => void;
  onClose?: () => void;
}

// Unit conversion map
const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
  kg: 1000,
  ml: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  cup: 240,
  cups: 240,
  scoop: 30,
  scoops: 30,
  serving: 1,
  servings: 1,
};

// Calculate servings from amount and unit
function calculateServings(food: FoodMatch, amount: number, unit: string): number {
  const normalizedUnit = unit.toLowerCase().trim();

  if (normalizedUnit === 'serving' || normalizedUnit === 'servings') {
    return amount;
  }

  if (food.serving_size_grams && food.serving_size_grams > 0) {
    const gramsPerUnit = UNIT_TO_GRAMS[normalizedUnit];
    if (gramsPerUnit) {
      const totalGrams = amount * gramsPerUnit;
      return totalGrams / food.serving_size_grams;
    }
  }

  return amount;
}

export function AIFoodLogger({ userId, onFoodSelected, onClose }: AIFoodLoggerProps) {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mealType, setMealType] = useState<string | undefined>();
  const [selectedFoods, setSelectedFoods] = useState<SelectedFood[]>([]);

  const processCommand = async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to process command');
        return;
      }

      if (data.parsed?.meal_type) {
        setMealType(data.parsed.meal_type);
      }

      // Auto-select best match for each food
      const newFoods: SelectedFood[] = [];
      for (const result of data.foodResults || []) {
        if (result.matches && result.matches.length > 0) {
          newFoods.push({
            parsed: result.parsed,
            match: result.matches[0], // Best match
          });
        }
      }

      if (newFoods.length === 0) {
        setError('No foods found. Try being more specific.');
        return;
      }

      // Append to existing foods instead of replacing
      setSelectedFoods(prev => [...prev, ...newFoods]);
      setInputText('');

    } catch (err) {
      setError('Failed to process. Please try again.');
      console.error('AI command error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoiceComplete = (text: string) => {
    if (text.trim()) {
      setInputText(text);
      processCommand(text);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processCommand(inputText);
  };

  const handleRemoveFood = (index: number) => {
    setSelectedFoods(foods => foods.filter((_, i) => i !== index));
  };

  const handleAcceptAll = () => {
    for (const food of selectedFoods) {
      onFoodSelected(food.match, food.parsed.amount, food.parsed.unit, mealType);
    }
    handleReset();
  };

  const handleReset = () => {
    setInputText('');
    setSelectedFoods([]);
    setError(null);
    setMealType(undefined);
  };

  return (
    <div className="space-y-4">
      {/* Input area - always visible */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder='Say "chicken and rice"'
          disabled={isProcessing}
          className="flex-1"
        />
        <VoiceInput
          onComplete={handleVoiceComplete}
          disabled={isProcessing}
        />
        <Button type="submit" disabled={isProcessing || !inputText.trim()}>
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>

      {/* Loading state */}
      {isProcessing && (
        <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Finding foods...</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Results list */}
      {selectedFoods.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-2">
            {selectedFoods.map((food, index) => {
              const servings = calculateServings(food.match, food.parsed.amount, food.parsed.unit);
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 rounded-md border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{food.match.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {food.parsed.amount} {food.parsed.unit} · {Math.round(food.match.calories * servings)} cal
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleRemoveFood(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleReset}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleAcceptAll}
            >
              <Check className="h-4 w-4 mr-1" />
              Add {selectedFoods.length} {selectedFoods.length === 1 ? 'Food' : 'Foods'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
