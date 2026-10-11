import cron from 'node-cron';
import { Attempt } from '../models/Attempt.js';
import { ATTEMPT_STATUS, AUTO_SUBMIT_BATCH, GRACE_SECONDS } from '../utils/constants.js';
import { finalizeAttempt } from '../services/attemptService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auto-submit');

let running = false;
let task = null;

export async function runOnce(now = new Date()) {
  if (running) return { skipped: true, finalized: 0 };
  running = true;
  let finalized = 0;

  try {
    const cutoff = new Date(now.getTime() - GRACE_SECONDS * 1000);
    const stale = await Attempt.find({
      status: ATTEMPT_STATUS.IN_PROGRESS,
      deadlineAt: { $lt: cutoff }
    })
      .select('_id')
      .limit(AUTO_SUBMIT_BATCH)
      .lean();

    for (const { _id } of stale) {
      try {
        await finalizeAttempt({ attemptId: _id, auto: true });
        finalized += 1;
      } catch (err) {
        log.error('failed to finalize', String(_id), err.message);
      }
    }

    if (finalized) log.info(`auto-submitted ${finalized} attempt(s)`);
    return { skipped: false, finalized };
  } catch (err) {
    log.error('auto-submit run failed:', err.message);
    return { skipped: false, finalized, error: err.message };
  } finally {
    running = false;
  }
}

export function startAutoSubmitJob(expression = '* * * * *') {
  if (task) return task;
  task = cron.schedule(expression, () => {
    runOnce().catch((err) => log.error('unexpected cron error:', err.message));
  });
  log.info(`auto-submit job scheduled (${expression})`);
  return task;
}

export function stopAutoSubmitJob() {
  task?.stop();
  task = null;
}

export default { startAutoSubmitJob, stopAutoSubmitJob, runOnce };
