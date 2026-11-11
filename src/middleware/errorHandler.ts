import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

/** Unknown /api routes get a JSON 404 rather than Express's HTML page. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}`, requestId: req.id },
  });
};

/**
 * Single place that turns errors into HTTP responses.
 * - AppError: known failure -> its status, code and message.
 * - Anything else: a bug -> 500 with a generic message. The real error and
 *   stack are logged, never sent to the client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    // Client mistakes (4xx) are expected: a short warning is enough.
    // Upstream/server failures (5xx) get the full error, including its cause.
    if (err.status >= 500) req.log.error({ code: err.code, err }, err.message);
    else req.log.warn({ code: err.code }, err.message);
    res.status(err.status).json({
      error: { code: err.code, message: err.message, requestId: req.id },
    });
    return;
  }

  req.log.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: req.id },
  });
};
