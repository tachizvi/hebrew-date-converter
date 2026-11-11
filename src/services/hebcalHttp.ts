import type { z } from 'zod';
import {
  AppError,
  UpstreamBadResponseError,
  UpstreamRejectedError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

/**
 * The HTTP plumbing every Hebcal call shares: timeout, status handling, retry
 * and response validation. The endpoint-specific clients (converter, holidays)
 * only build URLs and map payloads.
 */
export interface HebcalHttpOptions {
  timeoutMs: number;
  /** Extra attempts after the first one, only for network errors and 5xx. */
  retries: number;
  logger: Logger;
  /** Injected so tests can replace the network with a fake. */
  fetchFn?: typeof fetch;
  /** Delay between retries; injected so tests don't actually wait. */
  retryDelayMs?: number;
}

export function createHebcalHttp(options: HebcalHttpOptions) {
  const { timeoutMs, retries, logger, fetchFn = fetch, retryDelayMs = 200 } = options;

  /**
   * One HTTP call to Hebcal. The timeout covers the whole exchange - connecting,
   * headers and reading the body - so a server that stalls mid-response cannot
   * hang our request.
   */
  async function requestOnce(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    try {
      let response: Response;
      try {
        response = await fetchFn(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } catch (err) {
        if (controller.signal.aborted) throw new UpstreamTimeoutError(timeoutMs);
        throw new UpstreamUnavailableError('Could not reach Hebcal', { cause: err });
      }

      logger.debug({ url, status: response.status, ms: Date.now() - started }, 'hebcal response');

      if (response.status >= 500) {
        throw new UpstreamUnavailableError(`Hebcal returned HTTP ${response.status}`);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (err) {
        if (controller.signal.aborted) throw new UpstreamTimeoutError(timeoutMs);
        throw new UpstreamBadResponseError('Hebcal returned a non-JSON response', { cause: err });
      }

      if (!response.ok) {
        // Hebcal answers bad input with 400 + {"error": "..."}. We validate input
        // first, so reaching this means our validation and Hebcal's disagree.
        const upstreamMessage =
          typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : '';
        logger.warn({ url, status: response.status, upstreamMessage }, 'hebcal rejected request');
        throw new UpstreamRejectedError(response.status, upstreamMessage);
      }

      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  function isRetryable(err: unknown): boolean {
    // Retry only transient failures. A timeout already waited the full budget,
    // and a 4xx / bad payload will not get better by asking again.
    return err instanceof UpstreamUnavailableError;
  }

  /**
   * Calls Hebcal (with retry on transient failures) and validates the body
   * against the given schema. Used by every Hebcal call.
   */
  async function fetchValidated<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        const body = await requestOnce(url);
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          logger.error({ url, issues: parsed.error.issues }, 'unexpected hebcal payload');
          throw new UpstreamBadResponseError('Hebcal returned an unexpected payload');
        }
        return parsed.data;
      } catch (err) {
        if (attempt < retries && isRetryable(err)) {
          attempt++;
          logger.warn({ url, attempt, err: (err as AppError).message }, 'retrying hebcal');
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  return { fetchValidated };
}
