"use client";

import { useState } from "react";
import { Activity, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhoopStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WhoopStep({ onNext, onSkip }: WhoopStepProps) {
  const [hasWhoop, setHasWhoop] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    // Redirect to Whoop OAuth
    window.location.href = "/api/whoop/auth";
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to Health Tracker!</h1>
        <p className="text-muted-foreground">
          Let&apos;s get you set up in just a few steps.
        </p>
      </div>

      {/* Whoop question */}
      {hasWhoop === null && (
        <div className="space-y-4">
          <p className="text-center font-medium">Do you have a Whoop band?</p>
          <div className="flex justify-center gap-4">
            <Button
              variant="outline"
              size="lg"
              className="w-32 h-20 flex-col gap-2"
              onClick={() => setHasWhoop(true)}
            >
              <Activity className="w-6 h-6" />
              <span>Yes, I do</span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-32 h-20 flex-col gap-2"
              onClick={() => {
                setHasWhoop(false);
                onSkip();
              }}
            >
              <span className="text-2xl">🚫</span>
              <span>No, skip</span>
            </Button>
          </div>
        </div>
      )}

      {/* Connect Whoop */}
      {hasWhoop === true && !isConnected && (
        <div className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-center">Connect your Whoop</h3>
            <p className="text-sm text-muted-foreground text-center">
              We&apos;ll sync your recovery, strain, and sleep data automatically.
            </p>
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={handleConnect}
                disabled={isConnecting}
                className="gap-2"
              >
                {isConnecting ? (
                  "Connecting..."
                ) : (
                  <>
                    <Activity className="w-5 h-5" />
                    Connect Whoop
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="flex justify-center">
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          </div>
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <div className="space-y-6">
          <div className="bg-green-500/10 rounded-lg p-6 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h3 className="font-semibold text-green-500">Whoop Connected!</h3>
            <p className="text-sm text-muted-foreground">
              Your data will sync automatically.
            </p>
          </div>
          <div className="flex justify-center">
            <Button size="lg" onClick={onNext} className="gap-2">
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
