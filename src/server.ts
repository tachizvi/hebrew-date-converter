import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { TtlCache } from './lib/cache.js';
import { createLogger } from './lib/logger.js';
import { ConverterService } from './services/converterService.js';
import { createHebcalClient } from './services/hebcalClient.js';
import type { HebrewDateDto } from './types/dto.js';

/** Composition root: the only place that reads config and wires real dependencies. */
const config = loadConfig();
const logger = createLogger(config.logLevel);

const hebcalClient = createHebcalClient({ ...config.hebcal, logger });
const cache = new TtlCache<HebrewDateDto>(config.cache.ttlMs, config.cache.maxEntries);
const converterService = new ConverterService(hebcalClient, cache, logger);

const app = createApp({ converterService, logger });

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
