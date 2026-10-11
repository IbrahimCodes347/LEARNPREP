import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { readToken, verifyToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { createLogger } from '../utils/logger.js';
import { canJoinTest } from '../services/leaderboardService.js';
import { isValidObjectId } from '../utils/id.js';

const log = createLogger('socket');

let io = null;

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    path: '/socket.io'
  });

  // Handshake auth: the same JWT cookie used by REST. No token -> no connection.
  io.use(async (socket, next) => {
    try {
      const token = readToken(socket.handshake);
      if (!token) return next(new Error('Authentication required'));

      const payload = verifyToken(token);
      const user = await User.findById(payload.sub).select('role isActive name');
      if (!user) return next(new Error('Invalid session'));

      socket.data.user = { id: String(user._id), role: user.role, name: user.name };
      return next();
    } catch {
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('joinTest', async (testId) => {
      try {
        if (!isValidObjectId(testId)) return;
        const allowed = await canJoinTest({
          user: { _id: user.id, role: user.role },
          testId
        });
        if (!allowed) return; // silently ignored, per Security.md
        await socket.join(`test:${testId}`);
        socket.data.joined = String(testId);
        socket.emit('leaderboard:joined', { testId: String(testId) });
      } catch (err) {
        log.warn('joinTest failed:', err.message);
      }
    });

    socket.on('leaveTest', (testId) => {
      try {
        if (isValidObjectId(testId)) socket.leave(`test:${testId}`);
      } catch (err) {
        log.warn('leaveTest failed:', err.message);
      }
    });

    socket.on('disconnect', () => {
      log.debug(`socket ${socket.id} disconnected`);
    });
  });

  log.info('socket.io ready');
  return io;
}

export function getIo() {
  return io;
}

/**
 * Payload carries no personal data - the client just invalidates its
 * TanStack Query key and refetches over authenticated REST.
 */
export function emitLeaderboardUpdate(testId) {
  try {
    if (!io) return;
    io.to(`test:${testId}`).emit('leaderboard:update', { testId: String(testId) });
  } catch (err) {
    log.warn('leaderboard emit failed:', err.message);
  }
}

export default { initSockets, getIo, emitLeaderboardUpdate };
