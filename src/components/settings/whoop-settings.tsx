"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Link, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface WhoopStatus {
  connected: boolean;
  expiresAt?: string;
  isExpiringSoon?: boolean;
  error?: string;
}

export function WhoopSettings() {
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const checkStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/whoop/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false, error: "Failed to check status" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/whoop/auth";
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await fetch("/api/whoop/disconnect", { method: "POST" });
      setStatus({ connected: false });
    } catch {
      // Error handling
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await fetch("/api/whoop/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      // Refresh status after sync
      await checkStatus();
    } catch {
      // Error handling
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Whoop Integration</h3>
        <p className="text-sm text-muted-foreground">
          Connect your Whoop account to sync recovery, sleep, and strain data.
        </p>
      </div>
      <Separator />

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">Status:</Label>
            {status?.connected ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">Not connected</span>
              </div>
            )}
          </div>

          {status?.connected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Last 7 Days
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="text-destructive hover:text-destructive"
                >
                  {isDisconnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Unlink className="h-4 w-4 mr-2" />
                  )}
                  Disconnect
                </Button>
              </div>
              {status.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Token expires: {new Date(status.expiresAt).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your Whoop account to automatically sync your health metrics
                including recovery score, HRV, sleep quality, and daily strain.
              </p>
              <Button onClick={handleConnect} size="sm">
                <Link className="h-4 w-4 mr-2" />
                Connect Whoop
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
