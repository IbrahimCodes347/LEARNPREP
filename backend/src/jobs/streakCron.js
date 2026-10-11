import cron from 'node-cron';
import { emailEnabled, sendMissedDayReminders } from '../services/emailService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('streak-cron');

let running = false;
let task = null;

/** One daily run for students who missed a day; non-overlapping and safe. */
export async function runOnce(now = new Date()) {
  if (!emailEnabled()) return { skipped: true, sent: 0, reason: 'disabled' };
  if (running) return { skipped: true, sent: 0, reason: 'running' };
  running = true;
  try {
    return await sendMissedDayReminders(now);
  } catch (err) {
    log.error('streak reminder run failed:', err.message);
    return { skipped: false, sent: 0, error: err.message };
  } finally {
    running = false;
  }
}

export function startStreakReminderJob(expression = '0 8 * * *') {
  if (!emailEnabled()) {
    log.info('streak reminder job not started (email disabled)');
    return null;
  }
  if (task) return task;
  task = cron.schedule(expression, () => {
    runOnce().catch((err) => log.error('unexpected streak cron error:', err.message));
  });
  log.info(`streak reminder job scheduled (${expression})`);
  return task;
}

export function stopStreakReminderJob() {
  task?.stop();
  task = null;
}

export default { startStreakReminderJob, stopStreakReminderJob, runOnce };