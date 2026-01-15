"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
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
  | { type: "requesting_permission" }
  | { type: "scanning" }
  | { type: "loading"; barcode: string }
  | { type: "found"; food: TransformedOFFFood }
  | { type: "not_found"; barcode: string }
  | { type: "permission_denied" }
  | { type: "error"; message: string };

export function BarcodeScanner({ open, onClose, onFoodFound }: BarcodeScannerProps) {
  const [scanState, setScanState] = useState<ScanState>({ type: "requesting_permission" });
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [shouldStartScanner, setShouldStartScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isStartingRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING state
          await scannerRef.current.stop();
        }
      } catch {
        // Ignore stop errors
      }
    }
  }, []);

  const lookupBarcode = useCallback(async (barcode: string) => {
    setScanState({ type: "loading", barcode });

    try {
      const response = await fetch(`/api/food/barcode?barcode=${encodeURIComponent(barcode)}`);
      const data = await response.json();

      if (data.status === 1 && data.product) {
        // Transform the raw OFF data to our format
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

  // Request camera permission explicitly with timeout
  const requestCameraPermission = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return {
          success: false,
          error: "Camera not supported on this browser. Try using Safari on iOS."
        };
      }

      // First check if we're on HTTPS (required for camera on mobile)
      if (typeof window !== "undefined" &&
          window.location.protocol !== "https:" &&
          window.location.hostname !== "localhost") {
        return {
          success: false,
          error: "Camera requires a secure connection (HTTPS)."
        };
      }

      // Create a promise that times out after 10 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 10000);
      });

      // Try to get camera stream to trigger permission prompt
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        }),
        timeoutPromise
      ]);

      // Got permission, stop the stream (we'll use html5-qrcode to manage it)
      stream.getTracks().forEach(track => track.stop());
      return { success: true };
    } catch (error) {
      console.error("Camera permission error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage === "timeout") {
        return {
          success: false,
          error: "Camera request timed out. On iOS, try using Safari instead of Chrome."
        };
      }

      // Check for specific iOS/permission errors
      if (errorMessage.includes("not allowed") ||
          errorMessage.includes("Permission denied") ||
          errorMessage.includes("NotAllowedError")) {
        return { success: false, error: "permission_denied" };
      }

      return { success: false, error: errorMessage };
    }
  }, []);

  // Step 1: Request permission only
  const requestPermission = useCallback(async () => {
    setScanState({ type: "requesting_permission" });
    const result = await requestCameraPermission();

    if (!result.success) {
      setHasPermission(false);
      if (result.error === "permission_denied") {
        setScanState({ type: "permission_denied" });
      } else {
        setScanState({ type: "error", message: result.error || "Camera access failed" });
      }
      return;
    }

    // Permission granted - show scanning state (which renders the container)
    // The actual scanner will start via useEffect once container is ready
    setHasPermission(true);
    setScanState({ type: "scanning" });
    setShouldStartScanner(true);
  }, [requestCameraPermission]);

  // Step 2: Initialize scanner (called after container is rendered)
  const initializeScanner = useCallback(async () => {
    if (!containerRef.current || scannerRef.current || isStartingRef.current) return;

    isStartingRef.current = true;
    const scannerId = "barcode-scanner-region";

    // Create scanner element if it doesn't exist
    let scannerElement = document.getElementById(scannerId);
    if (!scannerElement) {
      scannerElement = document.createElement("div");
      scannerElement.id = scannerId;
      containerRef.current.appendChild(scannerElement);
    }

    const scanner = new Html5Qrcode(scannerId, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
      ],
      verbose: false,
    });

    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.5,
        },
        async (decodedText) => {
          // Stop scanning when barcode found
          await stopScanner();
          lookupBarcode(decodedText);
        },
        () => {
          // QR code scan error - ignore, keep scanning
        }
      );
    } catch (error) {
      console.error("Scanner error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific permission errors
      if (errorMessage.toLowerCase().includes("permission") ||
          errorMessage.toLowerCase().includes("denied") ||
          errorMessage.toLowerCase().includes("notallowed")) {
        setScanState({ type: "permission_denied" });
      } else {
        setScanState({
          type: "error",
          message: errorMessage,
        });
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [lookupBarcode, stopScanner]);

  // Start scanner when container is ready and we have permission
  useEffect(() => {
    if (shouldStartScanner && scanState.type === "scanning" && containerRef.current && !scannerRef.current) {
      // Small delay to ensure DOM is ready
      const timeout = setTimeout(() => {
        initializeScanner();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [shouldStartScanner, scanState.type, initializeScanner]);

  // Start permission request when dialog opens
  useEffect(() => {
    if (open) {
      setScanState({ type: "requesting_permission" });
      setHasPermission(null);
      setShouldStartScanner(false);
      isStartingRef.current = false;
      // Small delay to ensure dialog is rendered
      const timeout = setTimeout(() => {
        requestPermission();
      }, 100);
      return () => clearTimeout(timeout);
    } else {
      stopScanner();
      scannerRef.current = null;
      setShouldStartScanner(false);
      isStartingRef.current = false;
    }
  }, [open, requestPermission, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleScanAgain = async () => {
    // Stop any existing scanner
    await stopScanner();
    scannerRef.current = null;
    isStartingRef.current = false;
    setShouldStartScanner(false);

    // Clear the scanner container
    const scannerElement = document.getElementById("barcode-scanner-region");
    if (scannerElement) {
      scannerElement.remove();
    }

    // Request permission again
    await requestPermission();
  };

  const handleAddFood = () => {
    if (scanState.type === "found") {
      onFoodFound(scanState.food);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Requesting permission */}
          {scanState.type === "requesting_permission" && (
            <div className="py-12 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-medium">Camera Access Required</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please allow camera access when prompted
                </p>
              </div>
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
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
                    Camera permission was denied. To use the barcode scanner:
                  </p>
                </div>
              </div>

              <div className="text-sm space-y-2 px-1">
                <p className="font-medium">On iPhone/iPad:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open Settings → Safari → Camera</li>
                  <li>Set to "Ask" or "Allow"</li>
                  <li>Return here and try again</li>
                </ol>
              </div>

              <div className="text-sm space-y-2 px-1">
                <p className="font-medium">On Android:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Tap the lock icon in the address bar</li>
                  <li>Tap "Permissions" or "Site settings"</li>
                  <li>Enable Camera access</li>
                </ol>
              </div>

              <Button onClick={handleScanAgain} className="w-full">
                <Camera className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}

          {/* Scanner view */}
          {scanState.type === "scanning" && (
            <>
              <div
                ref={containerRef}
                className="relative w-full aspect-[3/2] bg-black rounded-lg overflow-hidden"
              />
              <p className="text-sm text-muted-foreground text-center">
                Point camera at barcode
              </p>
            </>
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
                <Button variant="outline" onClick={handleScanAgain} className="flex-1">
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
              <Button onClick={handleScanAgain} className="w-full">
                Try Again
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
              <Button onClick={handleScanAgain} className="w-full">
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

  // Get product name
  let name = product.product_name_en || product.product_name || "Unknown Product";

  // Add brand if available
  if (product.brands && !name.toLowerCase().includes(product.brands.toLowerCase())) {
    name = `${product.brands} ${name}`;
  }

  // Determine serving size
  let servingSize = "100g";
  let servingSizeGrams: number | null = 100;

  if (product.serving_size) {
    servingSize = product.serving_size;
    servingSizeGrams = product.serving_quantity || parseServingGrams(product.serving_size);
  }

  // Use per-serving values if available, otherwise per 100g
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
