const LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[LEVEL] ?? 2;

function log(level: keyof typeof levels, ...args: unknown[]) {
  if (levels[level] <= currentLevel) console[level](...args);
}

export const logger = {
  error: (...a: unknown[]) => log('error', '[ERROR]', ...a),
  warn:  (...a: unknown[]) => log('warn',  '[WARN]',  ...a),
  info:  (...a: unknown[]) => log('info',  '[INFO]',  ...a),
  debug: (...a: unknown[]) => log('debug', '[DEBUG]', ...a),
};
