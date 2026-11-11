import { z } from 'zod';
import type { Logger } from '../lib/logger.js';
import {
  AppError,
  UpstreamBadResponseError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../lib/errors.js';
import { toIsoDate } from '../validation/dateQuery.js';
import type { ConvertQuery, HebrewDateDto } from '../types/dto.js';

/**
 * The shape we expect from Hebcal's converter endpoint. Only the fields we use
 * are listed; anything else Hebcal adds is ignored. If a field we rely on is
 * missing or has the wrong type, we fail loudly instead of returning garbage.
 */
const hebcalResponseSchema = z.object({
  gy: z.number().int(),
  gm: z.number().int(),
  gd: z.number().int(),
  afterSunset: z.boolean().optional(),
  hy: z.number().int(),
  hm: z.string().min(1),
  hd: z.number().int(),
  hebrew: z.string().min(1),
  heDateParts: z.object({ y: z.string(), m: z.string(), d: z.string() }),
  events: z.array(z.string()).optional(),
});

type HebcalResponse = z.infer<typeof hebcalResponseSchema>;

export interface HebcalClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Extra attempts after the first one, only for network errors and 5xx. */
  retries: number;
  logger: Logger;
  /** Injected so tests can replace the network with a fake. */
  fetchFn?: typeof fetch;
  /** Delay between retries; injected so tests don't actually wait. */
  retryDelayMs?: number;
}

export interface HebcalClient {
  convert(query: ConvertQuery): Promise<HebrewDateDto>;
}

export function createHebcalClient(options: HebcalClientOptions): HebcalClient {
  const { baseUrl, timeoutMs, retries, logger, fetchFn = fetch, retryDelayMs = 200 } = options;

  function buildUrl(q: ConvertQuery): string {
    const url = new URL(baseUrl);
    url.searchParams.set('cfg', 'json');
    url.searchParams.set('g2h', '1');
    url.searchParams.set('gy', String(q.year));
    url.searchParams.set('gm', String(q.month));
    url.searchParams.set('gd', String(q.day));
    if (q.afterSunset) url.searchParams.set('gs', 'on');
    return url.toString();
  }

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
        throw new UpstreamBadResponseError(
          `Hebcal rejected the request (HTTP ${response.status})` +
            (upstreamMessage ? `: ${upstreamMessage}` : ''),
        );
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

  function toDto(q: ConvertQuery, r: HebcalResponse): HebrewDateDto {
    return {
      gregorian: { date: toIsoDate(q), afterSunset: r.afterSunset ?? q.afterSunset },
      hebrew: {
        year: r.hy,
        month: r.hm,
        day: r.hd,
        hebrewText: r.hebrew,
        parts: { day: r.heDateParts.d, month: r.heDateParts.m, year: r.heDateParts.y },
      },
      events: r.events ?? [],
    };
  }

  return {
    async convert(q) {
      const url = buildUrl(q);
      let attempt = 0;

      while (true) {
        try {
          const body = await requestOnce(url);
          const parsed = hebcalResponseSchema.safeParse(body);
          if (!parsed.success) {
            logger.error({ url, issues: parsed.error.issues }, 'unexpected hebcal payload');
            throw new UpstreamBadResponseError('Hebcal returned an unexpected payload');
          }
          return toDto(q, parsed.data);
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
    },
  };
}
