import { io } from 'socket.io-client';

// Same backend origin as http.js. The handshake rides the httpOnly cookie.
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

let socket = null;

/** Singleton. The handshake rides the httpOnly cookie, so nothing is passed. */
export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling']
    });
  }
  return socket;
};

export const closeSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/** Server ignores the join unless we have a submitted attempt for that test. */
export const joinTest = (testId) => {
  const s = getSocket();
  if (s.connected) s.emit('joinTest', testId);
  else s.once('connect', () => s.emit('joinTest', testId));
};

export const onLeaderboardUpdate = (handler) => {
  const s = getSocket();
  s.on('leaderboard:update', handler);
  return () => s.off('leaderboard:update', handler);
};

export default { getSocket, closeSocket, joinTest, onLeaderboardUpdate };