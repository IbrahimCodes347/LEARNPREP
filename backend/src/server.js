import http from 'http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { initSockets } from './sockets/index.js';
import { startAutoSubmitJob, stopAutoSubmitJob } from './jobs/autoSubmitJob.js';
import { startStreakReminderJob, stopStreakReminderJob } from './jobs/streakCron.js';
import { verifyEmailSetup } from './services/emailService.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('server');

let server = null;
let shuttingDown = false;

async function main() {
  // DB must be ready before we listen (Architecture §9).
  await connectDb();

  const app = createApp();
  server = http.createServer(app);
  initSockets(server);
  startAutoSubmitJob();
  startStreakReminderJob();

  // Non-fatal: a broken SMTP setup only logs once, it never stops the server.
  if (env.EMAIL_ENABLED) {
    verifyEmailSetup().catch((err) => log.error('email verify check crashed:', err.message));
  }

  server.listen(env.PORT, () => {
    log.info(`LearnPrep API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    log.info(`Health check: http://localhost:${env.PORT}/`);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} received - shutting down`);

  stopAutoSubmitJob();
  stopStreakReminderJob();

  const force = setTimeout(() => {
    log.error('Graceful shutdown timed out - forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await disconnectDb();
    log.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  log.error('Failed to start:', err.message);
  process.exit(1);
});
