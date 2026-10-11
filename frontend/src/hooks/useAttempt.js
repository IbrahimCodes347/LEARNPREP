import { useCallback, useEffect, useRef, useState } from 'react';
import { attempts } from '../api/endpoints';

const SAVE_DEBOUNCE_MS = 500;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/**
 * Owns the in-flight attempt: the answers map and a debounced, retrying save.
 * Scoring stays on the server, this only mirrors what the user picked.
 */
export const useAttempt = ({ attemptId, initialResponses = [] }) => {
  const [answers, setAnswers] = useState(() => {
    const map = {};
    for (const r of initialResponses) {
      map[String(r.questionId)] = r.selectedIndex ?? null;
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const timers = useRef({});
  const attemptsMade = useRef({});
  const enteredAt = useRef(Date.now());

  // Rebuild when a resumed attempt arrives with server-saved answers.
  useEffect(() => {
    const map = {};
    for (const r of initialResponses) map[String(r.questionId)] = r.selectedIndex ?? null;
    setAnswers(map);
  }, [attemptId, initialResponses]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(window.clearTimeout);
    },
    []
  );

  const pushSave = useCallback(
    async (questionId, selectedIndex, retry = 0) => {
      const key = String(questionId);
      setSaving(true);
      try {
        await attempts.saveAnswer(attemptId, {
          questionId: key,
          selectedIndex,
          timeSpentSec: Math.max(0, Math.round((Date.now() - enteredAt.current) / 1000))
        });
        attemptsMade.current[key] = 0;
        setSaveError(null);
      } catch (err) {
        // 400/403/409 are terminal - retrying cannot fix them.
        const status = err?.response?.status;
        const terminal = status && status < 500;
        if (terminal || retry >= MAX_RETRIES) {
          setSaveError(err?.response?.data?.message || 'Could not save that answer.');
          attemptsMade.current[key] = 0;
        } else {
          const nextRetry = retry + 1;
          attemptsMade.current[key] = nextRetry;
          setSaveError('Saving… retrying');
          window.setTimeout(
            () => pushSave(questionId, selectedIndex, nextRetry),
            RETRY_BASE_MS * nextRetry
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [attemptId]
  );

  // Banks time on the question being left, then resets the clock for the new one.
  const bankTime = useCallback(() => {
    enteredAt.current = Date.now();
  }, []);

  const selectAnswer = useCallback(
    (questionId, selectedIndex) => {
      const key = String(questionId);
      setAnswers((prev) => ({ ...prev, [key]: selectedIndex }));

      window.clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => pushSave(key, selectedIndex), SAVE_DEBOUNCE_MS);
    },
    [pushSave]
  );

  /** Flushes the pending debounce now. Returns the save so callers can await it. */
  const flushAnswer = useCallback(
    async (questionId) => {
      const key = String(questionId);
      window.clearTimeout(timers.current[key]);
      const value = answers[key];
      if (value === undefined || value === null) return undefined;
      return pushSave(key, value);
    },
    [answers, pushSave]
  );

  /** Reports a tab switch; resolves to the server response so the caller can
   *  react when reaching the limit auto-submits the attempt. */
  const logTabSwitch = useCallback(() => {
    if (!attemptId) return Promise.resolve(null);
    return attempts.logEvent(attemptId, { type: 'tab_switch' });
  }, [attemptId]);

  const answeredCount = Object.values(answers).filter((v) => v !== null && v !== undefined).length;

  return { answers, selectAnswer, flushAnswer, answeredCount, saving, saveError, bankTime, logTabSwitch };
};

export default useAttempt;