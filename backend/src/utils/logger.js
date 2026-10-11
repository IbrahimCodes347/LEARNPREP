const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

function write(level, scope, args) {
  const threshold = process.env.LOG_LEVEL ? (LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info) : LEVELS.info;
  if ((LEVELS[level] ?? 99) > threshold) return;
  const tag = scope ? `[${scope}]` : '';
  console.log(`${stamp()} ${level.toUpperCase().padEnd(5)} ${tag}`, ...args);
}

export function createLogger(scope) {
  return {
    error: (...args) => write('error', scope, args),
    warn: (...args) => write('warn', scope, args),
    info: (...args) => write('info', scope, args),
    debug: (...args) => write('debug', scope, args)
  };
}

export const logger = createLogger();

export default createLogger;
