/**
 * Every expected failure is an AppError with an HTTP status and a stable,
 * machine-readable code. The error middleware turns these into one consistent
 * JSON error shape, so clients never have to parse free text.
 */
export type ErrorCode =
  | 'INVALID_DATE'
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_BAD_RESPONSE'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The client sent something we cannot convert. */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'INVALID_DATE', message);
  }
}

/** Hebcal could not be reached, or answered with a server error. */
export class UpstreamUnavailableError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(502, 'UPSTREAM_UNAVAILABLE', message, options);
  }
}

/** Hebcal did not answer within the configured timeout. */
export class UpstreamTimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super(504, 'UPSTREAM_TIMEOUT', `Hebcal did not respond within ${timeoutMs} ms`);
  }
}

/** Hebcal answered, but not with something we understand. */
export class UpstreamBadResponseError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(502, 'UPSTREAM_BAD_RESPONSE', message, options);
  }
}

/**
 * Hebcal understood the request but refused it (4xx), e.g.
 * "Hebrew day 30 out of valid range 1-29 for Elul 5787". Kept separate so a
 * caller can decide whether that is our bug (502) or the user's input (400).
 */
export class UpstreamRejectedError extends UpstreamBadResponseError {
  constructor(
    public readonly upstreamStatus: number,
    public readonly upstreamMessage: string,
  ) {
    super(
      `Hebcal rejected the request (HTTP ${upstreamStatus})` +
        (upstreamMessage ? `: ${upstreamMessage}` : ''),
    );
  }
}

/** The request body is malformed (bad JSON, wrong shape). */
export class InvalidRequestError extends AppError {
  constructor(message: string) {
    super(400, 'INVALID_REQUEST', message);
  }
}
