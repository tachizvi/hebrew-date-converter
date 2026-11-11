import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { TtlCache } from './lib/cache.js';
import { createLogger } from './lib/logger.js';
import { ConverterService } from './services/converterService.js';
import { createHebcalClient } from './services/hebcalClient.js';
import { createHebcalHolidaysClient } from './services/hebcalHolidaysClient.js';
import { WorkdayService } from './services/workdayService.js';
import type { HebrewDateDto, MonthCalendarDto, WorkdayDto } from './types/dto.js';

/** Composition root: the only place that reads config and wires real dependencies. */
const config = loadConfig();
const logger = createLogger(config.logLevel);

const hebcalClient = createHebcalClient({ ...config.hebcal, logger });
const converterService = new ConverterService(
  hebcalClient,
  {
    dates: new TtlCache<HebrewDateDto>(config.cache.ttlMs, config.cache.maxEntries),
    months: new TtlCache<MonthCalendarDto>(config.cache.ttlMs, config.cache.maxEntries),
  },
  logger,
);

const workdayService = new WorkdayService(
  createHebcalHolidaysClient({ ...config.hebcal, logger }),
  // One entry per Gregorian year; holidays don't change, so the same TTL is fine.
  new TtlCache<Map<string, WorkdayDto>>(config.cache.ttlMs, 50),
  logger,
);

const app = createApp({ converterService, workdayService, logger });

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, hebcal: config.hebcal.baseUrl },
    `listening on http://localhost:${config.port}`,
  );
});

// Graceful shutdown: stop accepting connections, let in-flight requests finish.
function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
