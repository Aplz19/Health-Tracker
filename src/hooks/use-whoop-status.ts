"use client";

import { useState, useEffect, useCallback } from "react";

interface WhoopStatus {
  connected: boolean;
  expiresAt?: string;
  isExpiringSoon?: boolean;
  error?: string;
}

export function useWhoopStatus() {
  const [status, setStatus] = useState<WhoopStatus>({ connected: false });
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/whoop/status");
      const data = await response.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false, error: "Failed to check status" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connect = useCallback(() => {
    // Redirect to OAuth flow
    window.location.href = "/api/whoop/auth";
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/whoop/disconnect", { method: "POST" });
      setStatus({ connected: false });
    } catch {
      console.error("Failed to disconnect");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return {
    isConnected: status.connected,
    isLoading,
    error: status.error,
    connect,
    disconnect,
    refetch: checkStatus,
  };
}
