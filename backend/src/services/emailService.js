import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Attempt } from '../models/Attempt.js';
import { getLeaderboard } from './leaderboardService.js';
import { ROLES } from '../utils/constants.js';
import { dayKey } from '../utils/id.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('email');

let transporter = null;
let skipReason = null; // set once so the disabled message is logged exactly once

export function emailEnabled() {
  return env.EMAIL_ENABLED === true && Boolean(env.EMAIL_USER && env.EMAIL_PASS);
}

/**
 * Lazy transporter. Each call is free once the transport exists. When email is
 * disabled or credentials are missing it returns null and logs the reason once
 * - no crash, no per-email spam. Defaults target Gmail so only EMAIL_USER and
 * EMAIL_PASS are needed for the demo.
 */
function getTransporter() {
  if (transporter) return transporter;
  if (env.EMAIL_ENABLED !== true) {
    skipReason ??= 'disabled';
    log.info('EMAIL_ENABLED=false - email notifications are off');
    return null;
  }
  if (!env.EMAIL_USER || !env.EMAIL_PASS) {
    skipReason ??= 'missing-credentials';
    log.warn('EMAIL_ENABLED=true but EMAIL_USER/EMAIL_PASS are not set - email sending disabled');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_SECURE,
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS }
  });
  return transporter;
}

/**
 * Startup SMTP check (transporter.verify). Logs success/failure once and never
 * rejects - a broken SMTP config must not stop the server from booting.
 */
export async function verifyEmailSetup() {
  const mailer = getTransporter();
  if (!mailer) return { ok: false, reason: skipReason ?? 'disabled' };
  try {
    await mailer.verify();
    log.info('SMTP connection verified - email notifications ready');
    return { ok: true };
  } catch (err) {
    log.warn('SMTP verification failed - emails will be skipped:', err.message);
    return { ok: false, reason: err.message };
  }
}

/** Escape every user-provided value before it touches an HTML template. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Newlines could break a mail subject header, so collapse them. */
export function escapeSubject(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function fromAddress() {
  return env.EMAIL_FROM || env.EMAIL_USER;
}

async function loadUser(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select('name email').lean();
  const email = user?.email;
  if (!user || typeof email !== 'string' || email.trim() === '') return null;
  return { name: user.name ?? '', email: email.trim() };
}

function resultRows({ result, rank }) {
  const rows = [
    ['Score', `${result.score ?? 0} / ${result.totalMarks ?? 0} (${result.percentage ?? 0}%)`],
    ['Correct', String(result.correct ?? 0)],
    ['Wrong', String(result.wrong ?? 0)],
    ['Unattempted', String(result.unattempted ?? 0)],
    ['Status', result.passed === null ? 'No pass mark set' : result.passed ? 'Passed' : 'Failed'],
    ['Rank', rank ? `#${rank.rank} of ${rank.totalParticipants ?? '-'}` : '-']
  ];
  if (result.weakTopics?.length) rows.push(['Weak topics', result.weakTopics.join(', ')]);
  return rows;
}

function buildResultMessage({ name, test, result, rank }) {
  const title = escapeSubject(test?.title ?? 'Test');
  const rows = resultRows({ result, rank });
  const esc = (v) => escapeHtml(v);

  const text = [
    `Hi ${name},`,
    '',
    `Your result for "${title}" is ready.`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Log in to LearnPrep to see the full report card.'
  ].join('\n');

  const rowsHtml = rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#334155;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;">${esc(v)}</td></tr>`)
    .join('');

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">',
    `  <h2 style="margin:0 0 4px;">Your LearnPrep result is here</h2>`,
    `  <p style="margin:0 0 16px;color:#475569;">Hi ${esc(name)}, your result for <strong>${esc(title)}</strong> is ready.</p>`,
    `  <table style="border-collapse:collapse;font-size:14px;">${rowsHtml}</table>`,
    `  <p style="margin-top:16px;color:#475569;">Log in to LearnPrep to see the full report card.</p>`,
    '</div>'
  ].join('\n');

  return {
    subject: `LearnPrep result - ${title}`,
    text,
    html
  };
}

function buildWelcomeMessage({ name }) {
  const esc = (v) => escapeHtml(v);
  return {
    subject: 'Welcome to LearnPrep',
    text: [
      `Hi ${name},`,
      '',
      'Welcome to LearnPrep! Your account is ready.',
      'Log in, pick a test and start practising.',
      'You will receive an email here after each submitted test.',
      '',
      'If you did not create this account, you can ignore this email.'
    ].join('\n'),
    html: [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">',
      `  <h2 style="margin:0 0 4px;">Welcome to LearnPrep</h2>`,
      `  <p style="margin:0 0 16px;color:#475569;">Hi ${esc(name)}, your account is ready.</p>`,
      `  <p style="color:#475569;">Log in, pick a test and start practising. You will receive an email here after each submitted test.</p>`,
      `  <p style="color:#64748b;font-size:13px;">If you did not create this account, you can ignore this email.</p>`,
      '</div>'
    ].join('\n')
  };
}

function buildReminderMessage({ name }) {
  const esc = (v) => escapeHtml(v);
  return {
    subject: 'Your LearnPrep streak is waiting',
    text: [
      `Hi ${name},`,
      '',
      'You missed a practice day yesterday - your LearnPrep streak is on hold.',
      'Tough a quick test today to keep it alive.',
      '',
      'Log in to LearnPrep to get started.'
    ].join('\n'),
    html: [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">',
      `  <h2 style="margin:0 0 4px;">Your LearnPrep streak is on hold</h2>`,
      `  <p style="margin:0 0 16px;color:#475569;">Hi ${esc(name)}, you missed a practice day yesterday.</p>`,
      `  <p style="color:#475569;">Take a quick test today to keep your streak alive.</p>`,
      `  <p style="color:#475569;margin-bottom:0;">Log in to LearnPrep to get started.</p>`,
      '</div>'
    ].join('\n')
  };
}

async function claimAndSend({ attemptId, userId, test, result, rank }) {
  const mailer = getTransporter();
  if (!mailer) return { sent: false, reason: skipReason ?? 'disabled' };

  // Idempotency: only the finalize winner calls us, but this atomic claim makes
  // a re-send (cron race / double submit) harmless - the second call no-ops.
  const claimed = await Attempt.findOneAndUpdate(
    { _id: attemptId, 'result.emailSentAt': null },
    { $set: { 'result.emailSentAt': new Date() } }
  );
  if (!claimed) return { sent: false, reason: 'already-sent' };

  const user = await loadUser(userId);
  if (!user) return { sent: false, reason: 'no-email' };

  const { subject, text, html } = buildResultMessage({ name: user.name, test, result, rank });
  await mailer.sendMail({ from: fromAddress(), to: user.email, subject, text, html });
  return { sent: true };
}

/** Fires and forgets internally - it never rejects and never blocks submit. */
export async function sendResultEmail({ attemptId, userId, test, result, rank }) {
  try {
    if (!emailEnabled()) return { sent: false, reason: 'disabled' };
    const resolvedRank = rank ?? (await rankForAttempt(attemptId, test));
    return await claimAndSend({ attemptId, userId, test, result, rank: resolvedRank });
  } catch (err) {
    log.error('result email failed:', err.message);
    return { sent: false, reason: 'send-failed', error: err.message };
  }
}

async function rankForAttempt(attemptId, test) {
  try {
    const board = await getLeaderboard({ testId: test?._id, viewerId: null, limit: 100 });
    const row = board.entries.find((e) => String(e.attemptId) === String(attemptId));
    return row ? { rank: row.rank, totalParticipants: board.totalParticipants } : null;
  } catch (err) {
    log.warn('rank lookup for email failed - email sent without rank:', err.message);
    return null;
  }
}

export async function sendWelcomeEmail({ userId }) {
  try {
    if (!emailEnabled()) return { sent: false, reason: 'disabled' };
    const mailer = getTransporter();
    if (!mailer) return { sent: false, reason: skipReason ?? 'disabled' };
    const user = await loadUser(userId);
    if (!user) return { sent: false, reason: 'no-email' };
    const { subject, text, html } = buildWelcomeMessage({ name: user.name });
    await mailer.sendMail({ from: fromAddress(), to: user.email, subject, text, html });
    return { sent: true };
  } catch (err) {
    log.error('welcome email failed:', err.message);
    return { sent: false, reason: 'send-failed', error: err.message };
  }
}

/**
 * One reminder per student per day for users who took a test before but missed
 * yesterday. Never re-reminds in the same day (User.reminderSentOn).
 */
export async function sendMissedDayReminders(now = new Date()) {
  try {
    if (!emailEnabled()) return { skipped: true, sent: 0, reason: 'disabled' };
    const mailer = getTransporter();
    if (!mailer) return { skipped: true, sent: 0, reason: skipReason ?? 'disabled' };

    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    const candidates = await User.find({
      role: ROLES.STUDENT,
      isActive: true,
      isDeleted: false,
      email: { $type: 'string' },
      'streak.lastActiveDate': { $type: 'string', $nin: [today, yesterday] },
      reminderSentOn: { $ne: today }
    })
      .select('_id name email')
      .lean();

    let sent = 0;
    for (const user of candidates) {
      try {
        const { subject, text, html } = buildReminderMessage({ name: user.name });
        await mailer.sendMail({ from: fromAddress(), to: user.email, subject, text, html });
        await User.updateOne({ _id: user._id }, { $set: { reminderSentOn: today } });
        sent += 1;
      } catch (err) {
        log.error('reminder email failed:', String(user._id), err.message);
      }
    }

    if (sent) log.info(`sent ${sent} streak reminder email(s)`);
    return { skipped: false, sent, total: candidates.length };
  } catch (err) {
    log.error('reminder run failed:', err.message);
    return { skipped: false, sent: 0, error: err.message };
  }
}

export async function sendTestEmail(to) {
  try {
    const mailer = getTransporter();
    if (!mailer) return { sent: false, reason: skipReason ?? 'disabled' };
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) return { sent: false, reason: 'invalid-recipient' };
    await mailer.sendMail({
      from: fromAddress(),
      to,
      subject: 'LearnPrep test email',
      text: 'This is a test email from LearnPrep.\n\nIf you received this, SMTP is working.',
      html: '<p>This is a test email from <strong>LearnPrep</strong>.</p><p>If you received this, SMTP is working.</p>'
    });
    log.info('test email sent to', to);
    return { sent: true };
  } catch (err) {
    log.error('test email failed:', err.message);
    return { sent: false, reason: 'send-failed', error: err.message };
  }
}

export default { emailEnabled, verifyEmailSetup, sendResultEmail, sendWelcomeEmail, sendMissedDayReminders, sendTestEmail };