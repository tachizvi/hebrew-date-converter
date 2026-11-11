import { z } from 'zod';
import { UpstreamBadResponseError, UpstreamRejectedError, ValidationError } from '../lib/errors.js';
import { hebcalMonthName } from '../lib/hebrewCalendar.js';
import { createHebcalHttp, type HebcalHttpOptions } from './hebcalHttp.js';
import { dayOfWeek, isoDatesOfMonth, toIsoDate } from '../lib/dates.js';
import type {
  CalendarQuery,
  ConvertQuery,
  HebrewDateDto,
  HebrewDateQuery,
  HebrewPart,
  Lang,
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

export interface HebcalClientOptions extends HebcalHttpOptions {
  /** Hebcal's converter endpoint, e.g. https://www.hebcal.com/converter */
  baseUrl: string;
}

export interface HebcalClient {
  /** One Gregorian date -> Hebrew date. */
  convert(query: ConvertQuery, lang?: Lang): Promise<HebrewDateDto>;
  /** One Hebrew date -> Gregorian date (`h2g=1`). */
  convertFromHebrew(query: HebrewDateQuery, lang?: Lang): Promise<HebrewDateDto>;
  /** A whole Gregorian month in a single Hebcal call (range mode). */
  convertMonth(query: CalendarQuery, lang?: Lang): Promise<MonthCalendarDto>;
}

export function createHebcalClient(options: HebcalClientOptions): HebcalClient {
  const { baseUrl, logger } = options;
  const { fetchValidated } = createHebcalHttp(options);

  function buildUrl(
    params: Record<string, string>,
    direction: 'g2h' | 'h2g' = 'g2h',
    lang: Lang = 'en',
  ): string {
    const url = new URL(baseUrl);
    url.searchParams.set('cfg', 'json');
    url.searchParams.set(direction, '1');
    // Hebcal translates event names with lg=he; English is its default.
    if (lang === 'he') url.searchParams.set('lg', 'he');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
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
    async convert(q, lang = 'en') {
      const url = buildUrl(
        {
          gy: String(q.year),
          gm: String(q.month),
          gd: String(q.day),
          ...(q.afterSunset ? { gs: 'on' } : {}),
        },
        'g2h',
        lang,
      );
      const r = await fetchValidated(url, singleDateSchema);
      return {
        gregorian: { date: toIsoDate(q), afterSunset: r.afterSunset ?? q.afterSunset },
        hebrew: toHebrewPart(r),
        events: r.events ?? [],
      };
    },

    async convertFromHebrew(q, lang = 'en') {
      const url = buildUrl({ hy: String(q.year), hm: q.month, hd: String(q.day) }, 'h2g', lang);

      let r: z.infer<typeof singleDateSchema>;
      try {
        r = await fetchValidated(url, singleDateSchema);
      } catch (err) {
        // Day 30 of a 29-day month is only known to the calendar itself, so here
        // Hebcal's 400 IS a user input problem: pass its message on as our 400.
        if (
          err instanceof UpstreamRejectedError &&
          err.upstreamStatus === 400 &&
          err.upstreamMessage
        ) {
          throw new ValidationError(err.upstreamMessage);
        }
        throw err;
      }

      // Hebcal can silently re-map a month (e.g. Adar in a leap year -> Adar II).
      // Our validation prevents that, and this check makes sure the answer is
      // really for the date we asked about.
      const expectedMonth = hebcalMonthName(q.month);
      if (r.hy !== q.year || r.hd !== q.day || r.hm !== expectedMonth || r.gy < 1) {
        logger.error(
          { url, requested: q, got: { hy: r.hy, hm: r.hm, hd: r.hd, gy: r.gy } },
          'hebcal answered a different date',
        );
        throw new UpstreamBadResponseError(
          `Hebcal answered for ${r.hd} ${r.hm} ${r.hy} instead of ${q.day} ${expectedMonth} ${q.year}`,
        );
      }

      return {
        gregorian: { date: toIsoDate({ year: r.gy, month: r.gm, day: r.gd }), afterSunset: false },
        hebrew: toHebrewPart(r),
        events: r.events ?? [],
      };
    },

    async convertMonth({ year, month }, lang = 'en') {
      const dates = isoDatesOfMonth(year, month);
      const start = dates[0]!;
      const end = dates[dates.length - 1]!;
      const r = await fetchValidated(buildUrl({ start, end }, 'g2h', lang), rangeSchema);

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
