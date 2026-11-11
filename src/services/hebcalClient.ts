import { z } from 'zod';
import type { Logger } from '../lib/logger.js';
import {
  AppError,
  UpstreamBadResponseError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../lib/errors.js';
import { dayOfWeek, isoDatesOfMonth, toIsoDate } from '../lib/dates.js';
import type {
  CalendarQuery,
  ConvertQuery,
  HebrewDateDto,
  HebrewPart,
  MonthCalendarDto,
} from '../types/dto.js';

/**
 * The Hebrew-date fields Hebcal returns, both for a single date and for each
 * day of a range. Only the fields we use are listed; anything else Hebcal adds
 * is ignored. If a field we rely on is missing or has the wrong type, we fail
 * loudly instead of returning garbage.
 */
const hebrewDaySchema = z.object({
  hy: z.number().int(),
  hm: z.string().min(1),
  hd: z.number().int(),
  hebrew: z.string().min(1),
  heDateParts: z.object({ y: z.string(), m: z.string(), d: z.string() }),
  events: z.array(z.string()).optional(),
});

/** Single date: `?gy=..&gm=..&gd=..&g2h=1` */
const singleDateSchema = hebrewDaySchema.extend({
  gy: z.number().int(),
  gm: z.number().int(),
  gd: z.number().int(),
  afterSunset: z.boolean().optional(),
});

/** Date range: `?start=YYYY-MM-DD&end=YYYY-MM-DD&g2h=1` -> { hdates: { "YYYY-MM-DD": {...} } } */
const rangeSchema = z.object({
  start: z.string(),
  end: z.string(),
  hdates: z.record(z.string(), hebrewDaySchema),
});

type HebrewDay = z.infer<typeof hebrewDaySchema>;

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
  /** One Gregorian date -> Hebrew date. */
  convert(query: ConvertQuery): Promise<HebrewDateDto>;
  /** A whole Gregorian month in a single Hebcal call (range mode). */
  convertMonth(query: CalendarQuery): Promise<MonthCalendarDto>;
}

export function createHebcalClient(options: HebcalClientOptions): HebcalClient {
  const { baseUrl, timeoutMs, retries, logger, fetchFn = fetch, retryDelayMs = 200 } = options;

  function buildUrl(params: Record<string, string>): string {
    const url = new URL(baseUrl);
    url.searchParams.set('cfg', 'json');
    url.searchParams.set('g2h', '1');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
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

  /**
   * Calls Hebcal (with retry on transient failures) and validates the body
   * against the given schema. Shared by the single-date and the range calls.
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

  /** Hebcal's short field names -> our readable contract. */
  function toHebrewPart(r: HebrewDay): HebrewPart {
    return {
      year: r.hy,
      month: r.hm,
      day: r.hd,
      hebrewText: r.hebrew,
      parts: { day: r.heDateParts.d, month: r.heDateParts.m, year: r.heDateParts.y },
    };
  }

  return {
    async convert(q) {
      const url = buildUrl({
        gy: String(q.year),
        gm: String(q.month),
        gd: String(q.day),
        ...(q.afterSunset ? { gs: 'on' } : {}),
      });
      const r = await fetchValidated(url, singleDateSchema);
      return {
        gregorian: { date: toIsoDate(q), afterSunset: r.afterSunset ?? q.afterSunset },
        hebrew: toHebrewPart(r),
        events: r.events ?? [],
      };
    },

    async convertMonth({ year, month }) {
      const dates = isoDatesOfMonth(year, month);
      const start = dates[0]!;
      const end = dates[dates.length - 1]!;
      const r = await fetchValidated(buildUrl({ start, end }), rangeSchema);

      // Hebcal caps a range at 180 days and silently truncates anything longer
      // (verified with curl). A month is far below the cap, but we still verify
      // every requested day came back instead of rendering a calendar with holes.
      const missing = dates.filter((d) => !(d in r.hdates));
      if (missing.length > 0) {
        logger.error({ start, end, missing }, 'hebcal range response is incomplete');
        throw new UpstreamBadResponseError(
          `Hebcal returned ${dates.length - missing.length} of ${dates.length} days for ${start}..${end}`,
        );
      }

      return {
        month: toIsoDate({ year, month, day: 1 }).slice(0, 7),
        days: dates.map((date, i) => {
          const day = r.hdates[date]!;
          return {
            date,
            weekday: dayOfWeek(year, month, i + 1),
            hebrew: toHebrewPart(day),
            events: day.events ?? [],
          };
        }),
      };
    },
  };
}
