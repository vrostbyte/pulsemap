/**
 * PulseMap — Minimal structured logger.
 *
 * Wraps console.* so that all logging can be silenced in production by setting
 * the LOG_LEVEL environment variable (or by switching the exported `logger`
 * object's methods to no-ops).
 *
 * Usage:
 *   import { logger } from '@/utils/logger';
 *   logger.info('Data loaded', { count: 42 });
 *   logger.warn('API returned empty array');
 *   logger.error('Fetch failed', error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

// In production builds Vite replaces import.meta.env.PROD with true.
// Default to 'warn' in production so info/debug are suppressed.
const DEFAULT_LEVEL: LogLevel = import.meta.env.PROD ? 'warn' : 'debug';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function shouldLog(messageLevel: LogLevel): boolean {
  return LEVELS[messageLevel] >= LEVELS[DEFAULT_LEVEL];
}

function prefix(level: LogLevel): string {
  return `[PulseMap:${level.toUpperCase()}]`;
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.debug(prefix('debug'), message, ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.info(prefix('info'), message, ...args);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(prefix('warn'), message, ...args);
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(prefix('error'), message, ...args);
    }
  },
};
