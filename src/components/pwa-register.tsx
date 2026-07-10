'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") registration?.update();
    };

    navigator.serviceWorker.register("/sw.js").then((nextRegistration) => {
      registration = nextRegistration;
      void registration.update();
      document.addEventListener("visibilitychange", updateWhenVisible);
    }).catch(() => {
      // A failed registration must not block the app; the next visit retries.
    });

    return () => document.removeEventListener("visibilitychange", updateWhenVisible);
  }, []);

  return null;
}
