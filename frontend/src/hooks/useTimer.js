import { useEffect, useRef, useState } from 'react';

/**
 * Countdown from the SERVER deadline, never the browser clock. `start` returns
 * `deadlineAt` + `serverTime`, so we measure the round-trip offset once and count
 * down against the corrected clock (Phases.md risk table).
 */
export const useTimer = ({ deadlineAt, serverTime, onExpire }) => {
  const [remainingSec, setRemainingSec] = useState(0);
  const offsetRef = useRef(0);
  const expiredRef = useRef(false);

  // One-time clock offset (serverNow - clientNow) captured at mount.
  useEffect(() => {
    if (serverTime && deadlineAt) {
      offsetRef.current = new Date(serverTime).getTime() - Date.now();
    }
  }, [serverTime, deadlineAt]);

  useEffect(() => {
    if (!deadlineAt) return undefined;

    const tick = () => {
      const now = Date.now() + offsetRef.current;
      const left = Math.max(0, Math.floor((new Date(deadlineAt).getTime() - now) / 1000));
      setRemainingSec(left);
      if (left === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // onExpire is intentionally excluded: re-subscribing would reset the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt]);

  return {
    remainingSec,
    isWarning: remainingSec > 0 && remainingSec < 120,
    isError: remainingSec > 0 && remainingSec < 30,
    isExpired: remainingSec === 0
  };
};

export default useTimer;