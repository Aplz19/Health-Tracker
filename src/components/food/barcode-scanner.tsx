"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Quagga from "@ericblade/quagga2";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, X, Loader2, AlertCircle, Check, Settings } from "lucide-react";
import type { TransformedOFFFood } from "@/lib/openfoodfacts/types";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onFoodFound: (food: TransformedOFFFood) => void;
}

type ScanState =
  | { type: "initializing" }
  | { type: "scanning" }
  | { type: "loading"; barcode: string }
  | { type: "found"; food: TransformedOFFFood }
  | { type: "not_found"; barcode: string }
  | { type: "permission_denied" }
  | { type: "error"; message: string };

export function BarcodeScanner({ open, onClose, onFoodFound }: BarcodeScannerProps) {
  const [scanState, setScanState] = useState<ScanState>({ type: "initializing" });
  const scannerRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);

  const lookupBarcode = useCallback(async (barcode: string) => {
    setScanState({ type: "loading", barcode });

    try {
      const response = await fetch(`/api/food/barcode?barcode=${encodeURIComponent(barcode)}`);
      const data = await response.json();

      if (data.status === 1 && data.product) {
        const food = transformOFFProduct(data.product, barcode);
        setScanState({ type: "found", food });
      } else {
        setScanState({ type: "not_found", barcode });
      }
    } catch (error) {
      setScanState({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to lookup barcode",
      });
    }
  }, []);

  const stopScanner = useCallback(() => {
    Quagga.stop();
    hasStartedRef.current = false;
  }, []);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || hasStartedRef.current) return;

    setScanState({ type: "initializing" });

    try {
      await new Promise<void>((resolve, reject) => {
        Quagga.init(
          {
            inputStream: {
              type: "LiveStream",
              target: scannerRef.current!,
              constraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            decoder: {
              readers: [
                "ean_reader",
                "ean_8_reader",
                "upc_reader",
                "upc_e_reader",
              ],
            },
            locate: true,
            locator: {
              patchSize: "medium",
              halfSample: true,
            },
          },
          (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          }
        );
      });

      hasStartedRef.current = true;
      setScanState({ type: "scanning" });

      Quagga.start();

      // Set up detection handler
      Quagga.onDetected((result) => {
        if (result?.codeResult?.code) {
          const code = result.codeResult.code;

          // Vibrate on success
          if (navigator.vibrate) {
            navigator.vibrate(100);
          }

          stopScanner();
          lookupBarcode(code);
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("NotAllowed") ||
          errorMessage.includes("Permission") ||
          errorMessage.includes("not allowed")) {
        setScanState({ type: "permission_denied" });
      } else {
        setScanState({ type: "error", message: errorMessage });
      }
    }
  }, [lookupBarcode, stopScanner]);

  // Start scanner when dialog opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startScanner();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
  }, [open, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleRetry = () => {
    stopScanner();
    setTimeout(() => startScanner(), 100);
  };

  const handleAddFood = () => {
    if (scanState.type === "found") {
      onFoodFound(scanState.food);
      onClose();
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Initializing */}
          {scanState.type === "initializing" && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Starting camera...</p>
            </div>
          )}

          {/* Permission denied */}
          {scanState.type === "permission_denied" && (
            <div className="py-8 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <Settings className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">
                    Camera Access Blocked
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    Camera permission was denied.
                  </p>
                </div>
              </div>

              <div className="text-sm space-y-2 px-1">
                <p className="font-medium">On iPhone/iPad:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open Settings → Safari → Camera</li>
                  <li>Set to &quot;Ask&quot; or &quot;Allow&quot;</li>
                  <li>Return here and try again</li>
                </ol>
              </div>

              <Button onClick={handleRetry} className="w-full">
                <Camera className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}

          {/* Scanner viewport */}
          <div
            ref={scannerRef}
            className="relative w-full rounded-lg overflow-hidden bg-black"
            style={{
              minHeight: "300px",
              display: scanState.type === "scanning" || scanState.type === "initializing" ? "block" : "none"
            }}
          >
            {/* Scanning overlay */}
            {scanState.type === "scanning" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="w-64 h-20 border-2 border-white/80 rounded-lg">
                  <div className="absolute inset-x-0 h-0.5 bg-red-500 animate-pulse" style={{ top: "50%" }} />
                </div>
              </div>
            )}
          </div>

          {scanState.type === "scanning" && (
            <p className="text-sm text-muted-foreground text-center">
              Point at a barcode - it will scan automatically
            </p>
          )}

          {/* Loading state */}
          {scanState.type === "loading" && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <div>
                <p className="font-medium">Looking up product...</p>
                <p className="text-sm text-muted-foreground">
                  Barcode: {scanState.barcode}
                </p>
              </div>
            </div>
          )}

          {/* Found product */}
          {scanState.type === "found" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <Check className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-green-900 dark:text-green-100">
                    Product Found
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 truncate">
                    {scanState.food.name}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-muted-foreground">Serving</p>
                  <p className="font-medium">{scanState.food.serving_size}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-muted-foreground">Calories</p>
                  <p className="font-medium">{scanState.food.calories} kcal</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-muted-foreground">Protein</p>
                  <p className="font-medium">{scanState.food.protein}g</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-muted-foreground">Carbs</p>
                  <p className="font-medium">{scanState.food.total_carbohydrates}g</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRetry} className="flex-1">
                  Scan Another
                </Button>
                <Button onClick={handleAddFood} className="flex-1">
                  Add to Library
                </Button>
              </div>
            </div>
          )}

          {/* Not found */}
          {scanState.type === "not_found" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">
                    Product Not Found
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Barcode {scanState.barcode} is not in the database
                  </p>
                </div>
              </div>
              <Button onClick={handleRetry} className="w-full">
                Scan Another
              </Button>
            </div>
          )}

          {/* Error */}
          {scanState.type === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                <X className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">Error</p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {scanState.message}
                  </p>
                </div>
              </div>
              <Button onClick={handleRetry} className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Transform Open Food Facts raw product to our format
function transformOFFProduct(product: {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: Record<string, number>;
}, barcode: string): TransformedOFFFood {
  const n = product.nutriments || {};

  let name = product.product_name_en || product.product_name || "Unknown Product";

  if (product.brands && !name.toLowerCase().includes(product.brands.toLowerCase())) {
    name = `${product.brands} ${name}`;
  }

  let servingSize = "100g";
  let servingSizeGrams: number | null = 100;

  if (product.serving_size) {
    servingSize = product.serving_size;
    servingSizeGrams = product.serving_quantity || parseServingGrams(product.serving_size);
  }

  const hasServingData = n["energy-kcal_serving"] !== undefined;

  let calories: number;
  let protein: number;
  let totalFat: number;
  let carbs: number;
  let saturatedFat: number | null;
  let fiber: number | null;
  let sugar: number | null;
  let sodium: number | null;

  if (hasServingData && servingSizeGrams !== 100) {
    calories = n["energy-kcal_serving"] ?? 0;
    protein = n["proteins_serving"] ?? 0;
    totalFat = n["fat_serving"] ?? 0;
    carbs = n["carbohydrates_serving"] ?? 0;
    saturatedFat = n["saturated-fat_serving"] ?? null;
    fiber = n["fiber_serving"] ?? null;
    sugar = n["sugars_serving"] ?? null;
    sodium = n["sodium_serving"] ? n["sodium_serving"] * 1000 : null;
  } else {
    const scale = servingSizeGrams ? servingSizeGrams / 100 : 1;

    calories = Math.round((n["energy-kcal_100g"] ?? 0) * scale);
    protein = Math.round(((n["proteins_100g"] ?? 0) * scale) * 10) / 10;
    totalFat = Math.round(((n["fat_100g"] ?? 0) * scale) * 10) / 10;
    carbs = Math.round(((n["carbohydrates_100g"] ?? 0) * scale) * 10) / 10;
    saturatedFat = n["saturated-fat_100g"] ? Math.round((n["saturated-fat_100g"] * scale) * 10) / 10 : null;
    fiber = n["fiber_100g"] ? Math.round((n["fiber_100g"] * scale) * 10) / 10 : null;
    sugar = n["sugars_100g"] ? Math.round((n["sugars_100g"] * scale) * 10) / 10 : null;
    sodium = n["sodium_100g"] ? Math.round(n["sodium_100g"] * scale * 1000) : null;
  }

  return {
    name,
    serving_size: servingSize,
    serving_size_grams: servingSizeGrams,
    calories,
    protein,
    total_fat: totalFat,
    saturated_fat: saturatedFat,
    trans_fat: n["trans-fat_100g"] ?? null,
    polyunsaturated_fat: n["polyunsaturated-fat_100g"] ?? null,
    monounsaturated_fat: n["monounsaturated-fat_100g"] ?? null,
    sodium,
    total_carbohydrates: carbs,
    fiber,
    sugar,
    added_sugar: null,
    vitamin_a: n["vitamin-a_100g"] ?? null,
    vitamin_c: n["vitamin-c_100g"] ?? null,
    vitamin_d: n["vitamin-d_100g"] ?? null,
    calcium: n["calcium_100g"] ?? null,
    iron: n["iron_100g"] ?? null,
    barcode,
    source: "openfoodfacts",
  };
}

function parseServingGrams(servingSize: string): number | null {
  const match = servingSize.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?/i);
  if (match) {
    return parseFloat(match[1]);
  }

  const mlMatch = servingSize.match(/(\d+(?:\.\d+)?)\s*ml/i);
  if (mlMatch) {
    return parseFloat(mlMatch[1]);
  }

  return null;
}
