import { z } from 'zod';
import { ValidationError } from '../lib/errors.js';
import { isRealCalendarDate } from '../lib/dates.js';
import type { CalendarQuery, ConvertQuery } from '../types/dto.js';

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
