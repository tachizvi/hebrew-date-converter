import { z } from 'zod';
import { ValidationError } from '../lib/errors.js';
import { isRealCalendarDate } from '../lib/dates.js';
import { HEBREW_MONTH_CODES, isHebrewLeapYear } from '../lib/hebrewCalendar.js';
import type { CalendarQuery, ConvertQuery, HebrewDateQuery } from '../types/dto.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const querySchema = z.object({
  date: z
    .string({ error: 'Query parameter "date" is required (format YYYY-MM-DD)' })
    .regex(ISO_DATE, 'Date must be in YYYY-MM-DD format'),
  afterSunset: z
    .enum(['true', 'false'], { error: '"afterSunset" must be "true" or "false"' })
    .optional(),
});

/**
 * Turns raw query-string input into a typed ConvertQuery, or throws a
 * ValidationError (HTTP 400). We validate *before* calling Hebcal so bad input
 * never costs an upstream round-trip.
 */
export function parseConvertQuery(raw: unknown): ConvertQuery {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const [, y, m, d] = ISO_DATE.exec(parsed.data.date)!;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  if (year < 1) throw new ValidationError('Year must be between 0001 and 9999');
  if (!isRealCalendarDate(year, month, day)) {
    throw new ValidationError(`${parsed.data.date} is not a valid calendar date`);
  }

  return { year, month, day, afterSunset: parsed.data.afterSunset === 'true' };
}

const ISO_MONTH = /^(\d{4})-(\d{2})$/;

const monthSchema = z.object({
  month: z
    .string({ error: 'Query parameter "month" is required (format YYYY-MM)' })
    .regex(ISO_MONTH, 'Month must be in YYYY-MM format'),
});

/** Parses `?month=YYYY-MM` for the calendar endpoint, or throws a ValidationError (400). */
export function parseCalendarQuery(raw: unknown): CalendarQuery {
  const parsed = monthSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
  }
  const [, y, m] = ISO_MONTH.exec(parsed.data.month)!;
  const year = Number(y);
  const month = Number(m);
  if (year < 1) throw new ValidationError('Year must be between 0001 and 9999');
  if (month < 1 || month > 12) throw new ValidationError('Month must be between 01 and 12');
  return { year, month };
}

/**
 * Hebrew years we accept. Below 3762 the Gregorian result would be year 0 or
 * negative (Hebcal returns e.g. gy: -3760), which no Gregorian date input can show.
 */
export const MIN_HEBREW_YEAR = 3762;
export const MAX_HEBREW_YEAR = 9999;

const hebrewDateSchema = z.object({
  year: z.coerce
    .number({ error: 'Query parameter "year" is required' })
    .int('Year must be a whole number')
    .min(MIN_HEBREW_YEAR, `Hebrew year must be between ${MIN_HEBREW_YEAR} and ${MAX_HEBREW_YEAR}`)
    .max(MAX_HEBREW_YEAR, `Hebrew year must be between ${MIN_HEBREW_YEAR} and ${MAX_HEBREW_YEAR}`),
  month: z.enum(HEBREW_MONTH_CODES, {
    error: `"month" must be one of: ${HEBREW_MONTH_CODES.join(', ')}`,
  }),
  day: z.coerce
    .number({ error: 'Query parameter "day" is required' })
    .int('Day must be a whole number')
    .min(1, 'Day must be between 1 and 30')
    .max(30, 'Day must be between 1 and 30'),
});

/**
 * Parses `?year=5787&month=Kislev&day=1`.
 *
 * Checked here: format, ranges, and that Adar fits the year. Hebcal silently
 * re-maps a wrong Adar (Adar in a leap year -> Adar II, Adar I/II in a regular
 * year -> Adar), which would return a different date than the user asked for.
 *
 * Not checked here: whether a month has 29 or 30 days in a given year
 * (Cheshvan and Kislev vary). That needs the full calendar computation, so we
 * leave it to Hebcal and translate its 400 into ours.
 */
export function parseHebrewDateQuery(raw: unknown): HebrewDateQuery {
  const input = (raw ?? {}) as Record<string, unknown>;
  // Treat missing / empty params as missing (z.coerce would turn "" into 0).
  const cleaned = Object.fromEntries(
    ['year', 'month', 'day'].map((k) => [k, input[k] === '' ? undefined : input[k]]),
  );
  const parsed = hebrewDateSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  const { year, month, day } = parsed.data;
  const leap = isHebrewLeapYear(year);
  if (leap && month === 'Adar') {
    throw new ValidationError(`${year} is a leap year: choose Adar1 or Adar2`);
  }
  if (!leap && (month === 'Adar1' || month === 'Adar2')) {
    throw new ValidationError(`${year} is not a leap year: it has only Adar`);
  }
  return { year, month, day };
}
