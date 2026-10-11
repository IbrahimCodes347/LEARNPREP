import { useEffect, useRef } from 'react';

// Mirrors the server-side dedupe window so a visibilitychange + blur pair for
// one hide cannot fire two events (Rules.md proctoring).
const DOUBLE_FIRE_WINDOW_MS = 1000;

/** visibilitychange -> report the tab leave exactly once. The banner and any
 *  auto-submit handling live in the caller. */
export const useTabSwitch = ({ enabled, onTabSwitch }) => {
  const callbackRef = useRef(onTabSwitch);
  callbackRef.current = onTabSwitch;
  const lastFiredRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      const now = Date.now();
      if (now - lastFiredRef.current < DOUBLE_FIRE_WINDOW_MS) return;
      lastFiredRef.current = now;
      callbackRef.current?.();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);
};

export default useTabSwitch;