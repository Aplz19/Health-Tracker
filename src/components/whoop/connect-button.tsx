"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, Link2, Link2Off, Loader2 } from "lucide-react";

interface ConnectButtonProps {
  isConnected: boolean;
  isLoading: boolean;
  isSyncing?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync?: () => void;
}

export function WhoopConnectButton({
  isConnected,
  isLoading,
  isSyncing,
  onConnect,
  onDisconnect,
  onSync,
}: ConnectButtonProps) {
  if (isLoading) {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Checking...
      </Button>
    );
  }

  if (!isConnected) {
    return (
      <Button onClick={onConnect} className="gap-2">
        <Link2 className="h-4 w-4" />
        Connect Whoop
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      {onSync && (
        <Button
          variant="outline"
          onClick={onSync}
          disabled={isSyncing}
          className="gap-2"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isSyncing ? "Syncing..." : "Sync"}
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={onDisconnect}
        className="gap-2 text-muted-foreground hover:text-destructive"
      >
        <Link2Off className="h-4 w-4" />
        Disconnect
      </Button>
    </div>
  );
}
