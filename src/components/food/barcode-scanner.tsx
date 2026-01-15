"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
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
  | { type: "camera_ready" }
  | { type: "processing" }
  | { type: "loading"; barcode: string }
  | { type: "found"; food: TransformedOFFFood }
  | { type: "not_found"; barcode: string }
  | { type: "no_barcode_found" }
  | { type: "permission_denied" }
  | { type: "error"; message: string };

export function BarcodeScanner({ open, onClose, onFoodFound }: BarcodeScannerProps) {
  const [scanState, setScanState] = useState<ScanState>({ type: "requesting_permission" });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

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

  const startCamera = useCallback(async () => {
    setScanState({ type: "requesting_permission" });

    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScanState({
          type: "error",
          message: "Camera not supported on this browser. Try using Safari on iOS."
        });
        return;
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;

      // Wait for video element to be ready
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanState({ type: "camera_ready" });
      }
    } catch (error) {
      console.error("Camera error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("not allowed") ||
          errorMessage.includes("Permission denied") ||
          errorMessage.includes("NotAllowedError")) {
        setScanState({ type: "permission_denied" });
      } else {
        setScanState({ type: "error", message: errorMessage });
      }
    }
  }, []);

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setScanState({ type: "processing" });

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setScanState({ type: "error", message: "Could not get canvas context" });
      return;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob for scanning
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setScanState({ type: "error", message: "Could not capture image" });
        return;
      }

      try {
        // Create a file from the blob
        const file = new File([blob], "capture.png", { type: "image/png" });

        // Use Html5Qrcode to scan the file
        const html5Qrcode = new Html5Qrcode("temp-scanner");

        const result = await html5Qrcode.scanFile(file, true);

        // Clean up
        html5Qrcode.clear();

        // Stop camera and lookup the barcode
        stopCamera();
        lookupBarcode(result);
      } catch (error) {
        console.error("Scan error:", error);
        // No barcode found in the image
        setScanState({ type: "no_barcode_found" });
      }
    }, "image/png");
  }, [stopCamera, lookupBarcode]);

  // Start camera when dialog opens
  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const handleRetry = () => {
    startCamera();
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
          {/* Hidden temp element for scanner */}
          <div id="temp-scanner" style={{ display: "none" }} />

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} style={{ display: "none" }} />

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

              <Button onClick={handleRetry} className="w-full">
                <Camera className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}

          {/* Camera ready - show video feed with capture button */}
          {scanState.type === "camera_ready" && (
            <div className="space-y-4">
              <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ minHeight: "280px" }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ minHeight: "280px" }}
                />
                {/* Scanning guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-24 border-2 border-white/70 rounded-lg" />
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Position barcode in the box, then tap capture
              </p>

              {/* Capture button */}
              <div className="flex justify-center">
                <button
                  onClick={captureAndScan}
                  className="w-16 h-16 rounded-full bg-white border-4 border-primary flex items-center justify-center hover:bg-gray-100 active:scale-95 transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-primary" />
                </button>
              </div>
            </div>
          )}

          {/* Processing */}
          {scanState.type === "processing" && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <p className="font-medium">Scanning barcode...</p>
            </div>
          )}

          {/* No barcode found */}
          {scanState.type === "no_barcode_found" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">
                    No Barcode Detected
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Make sure the barcode is clearly visible and well-lit
                  </p>
                </div>
              </div>
              <Button onClick={handleRetry} className="w-full">
                Try Again
              </Button>
            </div>
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
