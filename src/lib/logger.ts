import { pino, type Logger } from 'pino';

/**
 * Structured JSON logs (one object per line) - easy to ship to any log platform.
 * In development, pipe through pino-pretty: `npm run dev | npx pino-pretty`.
 */
export function createLogger(level: string): Logger {
  return pino({ level, base: { service: 'hebrew-date-converter' } });
}

export type { Logger };
