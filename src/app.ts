import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { batchRouter } from './routes/batch.js';
import { calendarRouter } from './routes/calendar.js';
import { convertRouter } from './routes/convert.js';
import { healthRouter } from './routes/health.js';
import { workdayRouter } from './routes/workday.js';
import type { ConverterService } from './services/converterService.js';
import type { WorkdayService } from './services/workdayService.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export interface AppDeps {
  converterService: ConverterService;
  workdayService: WorkdayService;
  logger: Logger;
}

/**
 * Builds the Express app from its dependencies. Nothing here opens a port or
 * touches the network, so tests can create an app with fakes and call it
 * directly with Supertest.
 */
export function createApp({ converterService, workdayService, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Request logging + a request id (reused from X-Request-Id if the caller sent one),
  // returned in the response header and in every error body for tracing.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => !req.url?.startsWith('/api') },
    }),
  );

  app.use('/api', healthRouter());
  app.use('/api', convertRouter(converterService));
  app.use('/api', batchRouter(converterService));
  app.use('/api', calendarRouter(converterService));
  app.use('/api', workdayRouter(workdayService, converterService));
  app.use('/api', notFoundHandler);

  app.use(express.static(publicDir));

  app.use(errorHandler);
  return app;
}
