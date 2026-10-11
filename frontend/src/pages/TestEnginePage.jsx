import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { attempts, tests } from '../api/endpoints';
import { apiErrorMessage } from '../lib/utils';
import { useAttempt } from '../hooks/useAttempt';
import { useTimer } from '../hooks/useTimer';
import { useTabSwitch } from '../hooks/useTabSwitch';
import Timer from '../components/test/Timer';
import QuestionCard from '../components/test/QuestionCard';
import QuestionPalette from '../components/test/QuestionPalette';
import SubmitModal from '../components/test/SubmitModal';
import TabSwitchBanner from '../components/test/TabSwitchBanner';
import { Loader } from '../components/common/Loader';
import { notify } from '../components/common/Toast';

/**
 * Stable identity, so useAttempt's resume effect does not re-fire forever while
 * `started` is still null. A literal `?? []` would be a new array every render.
 */
const NO_RESPONSES = [];

const TestEnginePage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // `start` is idempotent, so calling it on mount resumes the same attempt.
  const [started, setStarted] = useState(location.state?.started ?? null);
  const [bootError, setBootError] = useState('');
  const [current, setCurrent] = useState(0);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState({ show: false, count: 0, limit: 0 });

  useEffect(() => {
    if (started) return;
    let cancelled = false;
    tests
      .start(testId)
      .then((data) => {
        if (!cancelled) setStarted(data);
      })
      .catch((err) => {
        if (!cancelled) setBootError(apiErrorMessage(err, 'This test is not currently available.'));
      });
    return () => {
      cancelled = true;
    };
  }, [testId, started]);

  const questions = useMemo(() => started?.questions ?? [], [started]);
  const total = questions.length;
  // 0 (missing field on an old test) means detection only - never an auto-submit.
  const tabLimit = started?.test?.maxTabSwitches ?? 0;

  const { answers, selectAnswer, flushAnswer, answeredCount, saving, saveError, bankTime, logTabSwitch } =
    useAttempt({ attemptId: started?.id, initialResponses: started?.responses ?? NO_RESPONSES });

  const doSubmit = useCallback(
    async (reason) => {
      if (!started?.id || submitting) return;
      setSubmitting(true);
      try {
        // Flush and WAIT: the server only scores answers it has persisted.
        await flushAnswer(questions[current]?._id);
        const done = await attempts.submit(started.id);
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        await queryClient.invalidateQueries({ queryKey: ['tests'] });
        if (reason === 'timeout') notify('Time is up - your test was submitted automatically.', 'warning');
        navigate(`/attempts/${started.id}/result`, { replace: true, state: { result: done } });
      } catch (err) {
        notify(apiErrorMessage(err, 'Could not submit the test.'));
      } finally {
        setSubmitting(false);
        setShowSubmit(false);
      }
    },
    [started?.id, submitting, current, flushAnswer, navigate, queryClient, questions]
  );

  const { remainingSec, isWarning, isError, isExpired } = useTimer({
    deadlineAt: started?.deadlineAt,
    serverTime: started?.serverTime,
    onExpire: () => doSubmit('timeout')
  });

  const handleTabSwitch = useCallback(async () => {
    if (!started?.id) return;
    try {
      const res = await logTabSwitch();
      if (res?.autoSubmitted) {
        notify('Test was submitted automatically because of tab switching.', 'warning');
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        await queryClient.invalidateQueries({ queryKey: ['tests'] });
        navigate(`/attempts/${started.id}/result`, { replace: true });
        return;
      }
      setBanner({ show: true, count: res?.tabSwitchCount ?? 1, limit: tabLimit });
    } catch (err) {
      // 409 = already submitted (the limit hit on a resuming old tab): go to the result.
      if (err?.response?.status === 409) {
        navigate(`/attempts/${started.id}/result`, { replace: true });
        return;
      }
      setBanner((prev) => ({ ...prev, show: true, count: prev.count + 1 }));
    }
  }, [started?.id, logTabSwitch, navigate, queryClient, tabLimit]);

  useTabSwitch({
    enabled: Boolean(started?.id),
    onTabSwitch: handleTabSwitch
  });

  if (bootError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="alert alert-error max-w-md">
          <span>{bootError}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/tests')}>
          Back to tests
        </button>
      </div>
    );
  }

  if (!started) return <Loader label="Preparing your test…" />;

  const locked = isExpired || submitting;
  const question = questions[current];

  // Bank time on the question being left before moving on.
  const jump = (i) => {
    flushAnswer(question?._id);
    bankTime();
    setCurrent(i);
  };

  const goNext = () => {
    flushAnswer(question?._id);
    bankTime();
    setCurrent((c) => Math.min(total - 1, c + 1));
  };

  const goPrev = () => {
    bankTime();
    setCurrent((c) => Math.max(0, c - 1));
  };

  const isLast = current >= total - 1;

  // Single entry point for the confirm modal, shared by Submit test, Finish and
  // Leave-on-last-question, so there is only ever one submit path.
  const requestSubmit = () => {
    setShowSubmit(true);
    const drawer = document.getElementById('palette-drawer');
    if (drawer?.checked) drawer.checked = false;
  };

  const leave = () => {
    bankTime();
    if (isLast) {
      requestSubmit();
      return;
    }
    // Leave = skip: no answer is saved for this question.
    setCurrent((c) => Math.min(total - 1, c + 1));
  };

  const finish = () => {
    // Save the current answer, then open the same confirm modal as Submit test.
    flushAnswer(question?._id);
    bankTime();
    requestSubmit();
  };

  const palette = (
    <QuestionPalette
      total={total}
      answers={questions.map((q) => answers[String(q._id)] ?? null)}
      currentIndex={current}
      onJump={jump}
      footer={
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={requestSubmit}
          disabled={locked}
        >
          Submit test
        </button>
      }
    />
  );

  return (
    <div className="min-h-screen bg-base-200">
      <header className="navbar sticky top-0 z-40 border-b border-base-300 bg-base-100">
        <div className="flex-1 items-center gap-4">
          <Timer remainingSec={remainingSec} isWarning={isWarning} isError={isError} />
        </div>
        <div className="flex-none items-center gap-4">
          <span className="text-sm">
            Q <strong>{current + 1}</strong>/{total}
          </span>
          <div className="hidden sm:block">
            <progress
              className="progress progress-primary w-32"
              value={answeredCount}
              max={total || 1}
              aria-label="Answered questions"
            />
          </div>
          <span className="text-sm">
            Answered <strong>{answeredCount}</strong>/{total}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <TabSwitchBanner
          show={banner.show}
          count={banner.count}
          limit={tabLimit}
          onDismiss={() => setBanner((prev) => ({ ...prev, show: false }))}
        />

        {saveError && (
          <div role="status" className="alert alert-warning py-2 text-sm">
            <span>{saveError}</span>
          </div>
        )}
        {saving && <p className="text-xs opacity-60">Saving…</p>}

        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div className="flex flex-col gap-4">
            {question && (
              <QuestionCard
                question={question}
                index={current}
                total={total}
                selectedIndex={answers[String(question._id)] ?? null}
                onSelect={(i) => selectAnswer(question._id, i)}
                disabled={locked}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={goPrev}
                disabled={current === 0 || locked}
              >
                Previous
              </button>

              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={leave} disabled={locked}>
                  Leave
                </button>
                {isLast ? (
                  <button type="button" className="btn btn-primary" onClick={finish} disabled={locked}>
                    Finish
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={goNext} disabled={locked}>
                    Save &amp; next
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Palette is a drawer on mobile (Design.md responsive). */}
          <aside className="hidden lg:block">{palette}</aside>

          <div className="drawer drawer-end lg:hidden">
            <input id="palette-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content">
              <label htmlFor="palette-drawer" className="btn btn-outline btn-sm btn-block">
                Open palette
              </label>
            </div>
            <div className="drawer-side">
              <label htmlFor="palette-drawer" aria-label="Close palette" className="drawer-overlay" />
              <div className="min-h-full w-72 p-4">{palette}</div>
            </div>
          </div>
        </div>
      </main>

      <SubmitModal
        open={showSubmit}
        answered={answeredCount}
        total={total}
        submitting={submitting}
        onConfirm={() => doSubmit('manual')}
        onClose={() => setShowSubmit(false)}
      />
    </div>
  );
};

export default TestEnginePage;