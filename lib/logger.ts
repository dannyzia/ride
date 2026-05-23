const LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[LEVEL] ?? 2;
type Level = keyof typeof levels;

function log(level: Level, ...args: unknown[]) {
  if (levels[level] <= currentLevel) (console as unknown as Record<string, Function>)[level](...args);
}

export const logger = {
  error: (...a: unknown[]) => log('error', '[ERROR]', ...a),
  warn:  (...a: unknown[]) => log('warn',  '[WARN]',  ...a),
  info:  (...a: unknown[]) => log('info',  '[INFO]',  ...a),
  debug: (...a: unknown[]) => log('debug', '[DEBUG]', ...a),
};
