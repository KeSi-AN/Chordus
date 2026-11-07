"use client";

import { useCallback, useSyncExternalStore } from "react";

/** In-memory fallback when localStorage is unavailable (private mode, blocked storage). */
const memory = new Map<string, number>();
const eventName = (key: string) => `stored-number:${key}`;

function read(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return Number(raw);
  } catch {
    // Fall through to the in-memory value.
  }
  return memory.get(key) ?? null;
}

/**
 * A per-viewer number remembered in localStorage (e.g. sheet font size). Server render and
 * first client render use `fallback`, so there is no hydration mismatch.
 */
export function useStoredNumber(
  key: string,
  fallback: number,
  isValid: (n: number) => boolean,
): [number, (n: number) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      window.addEventListener(eventName(key), cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(eventName(key), cb);
        window.removeEventListener("storage", cb);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => {
    const v = read(key);
    return v !== null && isValid(v) ? v : fallback;
  }, [key, fallback, isValid]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);

  const set = useCallback(
    (n: number) => {
      memory.set(key, n);
      try {
        localStorage.setItem(key, String(n));
      } catch {
        // Kept in memory for this page only.
      }
      window.dispatchEvent(new Event(eventName(key)));
    },
    [key],
  );
  return [value, set];
}
