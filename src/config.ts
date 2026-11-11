import 'dotenv/config';
import { z } from 'zod';

/**
 * All runtime configuration comes from environment variables.
 * Values are validated once at startup so a bad deployment fails fast
 * instead of failing on the first request.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // true: fail if PORT is taken (production). false: use the next free port (development).
  STRICT_PORT: z
    .enum(['true', 'false'], { error: 'must be "true" or "false"' })
    .default('false')
    .transform((v) => v === 'true'),
  HEBCAL_BASE_URL: z.url().default('https://www.hebcal.com/converter'),
  HEBCAL_HOLIDAYS_URL: z.url().default('https://www.hebcal.com/hebcal'),
  HEBCAL_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  HEBCAL_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(1000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = {
  port: number;
  strictPort: boolean;
  hebcal: { baseUrl: string; holidaysUrl: string; timeoutMs: number; retries: number };
  cache: { ttlMs: number; maxEntries: number };
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${details}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    strictPort: e.STRICT_PORT,
    hebcal: {
      baseUrl: e.HEBCAL_BASE_URL,
      holidaysUrl: e.HEBCAL_HOLIDAYS_URL,
      timeoutMs: e.HEBCAL_TIMEOUT_MS,
      retries: e.HEBCAL_RETRIES,
    },
    cache: { ttlMs: e.CACHE_TTL_MS, maxEntries: e.CACHE_MAX_ENTRIES },
    logLevel: e.LOG_LEVEL,
  };
}
