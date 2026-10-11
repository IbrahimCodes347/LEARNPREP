import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { setNetworkNotifier } from '../../api/http';

const TONE_META = {
  error: { alert: 'alert-error', Icon: XCircle, ms: 6000 },
  success: { alert: 'alert-success', Icon: CheckCircle2, ms: 4000 },
  warning: { alert: 'alert-warning', Icon: AlertTriangle, ms: 4000 },
  info: { alert: 'alert-info', Icon: Info, ms: 4000 }
};

const MAX_VISIBLE = 3;
const FALLBACK_TONE = 'info';

let push = () => {};
const listeners = new Set();

/** Toast messages are pushed from the axios interceptor or from a mutation. */
export const notify = (message, tone = 'error') => push(message, tone);

/** A single toast: auto-dismisses (paused while hovered) and can be closed. */
const ToastItem = ({ id, message, tone, remove }) => {
  const meta = TONE_META[tone] ?? TONE_META[FALLBACK_TONE];
  const Icon = meta.Icon;
  const timer = useRef(null);
  const startedAt = useRef(null);
  const pausedAt = useRef(null);
  const arm = useRef(() => {});

  useEffect(() => {
    arm.current = (resuming = false) => {
      clearTimeout(timer.current);
      if (!resuming) {
        startedAt.current = Date.now();
        pausedAt.current = null;
      }
      const elapsed = startedAt.current ? Date.now() - startedAt.current : 0;
      const rest = Math.max(0, meta.ms - elapsed);
      timer.current = window.setTimeout(() => remove(id), rest);
    };
    arm.current();
    return () => clearTimeout(timer.current);
  }, [id, meta.ms, remove]);

  const pause = () => {
    if (pausedAt.current) return;
    pausedAt.current = Date.now();
    clearTimeout(timer.current);
  };

  const resume = () => {
    if (pausedAt.current) {
      // Drop the paused time out of the elapsed clock so the toast still has
      // its full remaining lifetime when the pointer leaves the toast.
      startedAt.current = Date.now() - (pausedAt.current - startedAt.current);
      pausedAt.current = null;
    }
    arm.current(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`alert ${meta.alert} pointer-events-auto w-full shadow-lg`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        aria-label="Dismiss"
        onClick={() => remove(id)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

export const Toast = () => {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  useEffect(() => {
    const listener = ({ message, tone, id }) => {
      // Keep the newest MAX_VISIBLE toasts (drop the oldest beyond the limit).
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
    };
    listeners.add(listener);
    push = (message, tone) => listener({ message, tone, id: Date.now() + Math.random() });
    // Register as the single network-error notifier for the axios interceptor.
    setNetworkNotifier(push);
    return () => {
      listeners.delete(listener);
      setNetworkNotifier(() => {});
      push = () => {};
    };
  }, []);

  if (items.length === 0) return null;

  // Top-center, just below the navbar (navbar is 4rem tall). The container lets
  // clicks pass through so navbar tabs stay clickable; only the toast boxes
  // capture pointer events. inset-x-4 = 16 px side margin on mobile.
  return (
    <div className="pointer-events-none fixed inset-x-4 top-16 z-50 mx-auto flex max-w-md flex-col gap-2">
      {items.map((t) => (
        <ToastItem key={t.id} id={t.id} message={t.message} tone={t.tone} remove={remove} />
      ))}
    </div>
  );
};

export default Toast;