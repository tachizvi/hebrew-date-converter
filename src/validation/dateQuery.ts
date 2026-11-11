import { z } from 'zod';
import { ValidationError } from '../lib/errors.js';
import type { ConvertQuery } from '../types/dto.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for dates that exist in the calendar (rejects 2025-02-30, 2023-02-29...). */
export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the next month is the last day of this month.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

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

/** Formats a ConvertQuery back to YYYY-MM-DD (also used as part of the cache key). */
export function toIsoDate({ year, month, day }: Pick<ConvertQuery, 'year' | 'month' | 'day'>): string {
  const pad = (n: number, len: number) => String(n).padStart(len, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}
