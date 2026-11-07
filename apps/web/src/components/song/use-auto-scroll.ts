"use client";

import { useEffect, useRef, useState } from "react";

/** Base scroll speed at 100 BPM and font size 16, in px per second. */
const BASE_PX_PER_SEC = 14;

/**
 * Page auto-scroll whose speed follows the song's BPM (and font size), with a user multiplier.
 * Stops at the bottom of the page.
 */
export function useAutoScroll(bpm: number | null, fontSize: number) {
  const [running, setRunning] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const carry = useRef(0);

  const pxPerSec = BASE_PX_PER_SEC * ((bpm ?? 90) / 100) * (fontSize / 16) * multiplier;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      carry.current += pxPerSec * dt;
      const whole = Math.floor(carry.current);
      if (whole >= 1) {
        carry.current -= whole;
        window.scrollBy(0, whole);
      }
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      if (atBottom) {
        setRunning(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, pxPerSec]);

  return {
    running,
    toggle: () => setRunning((r) => !r),
    stop: () => setRunning(false),
    multiplier,
    faster: () => setMultiplier((m) => Math.min(4, Math.round((m + 0.1) * 10) / 10)),
    slower: () => setMultiplier((m) => Math.max(0.2, Math.round((m - 0.1) * 10) / 10)),
  };
}
