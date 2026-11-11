import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/lib/errors.js';
import {
  isRealCalendarDate,
  parseConvertQuery,
  toIsoDate,
} from '../../src/validation/dateQuery.js';

describe('parseConvertQuery', () => {
  it('parses a valid date', () => {
    expect(parseConvertQuery({ date: '2026-11-11' })).toEqual({
      year: 2026,
      month: 11,
      day: 11,
      afterSunset: false,
    });
  });

  it('parses afterSunset=true', () => {
    expect(parseConvertQuery({ date: '2026-11-11', afterSunset: 'true' }).afterSunset).toBe(true);
  });

  it.each([
    [{}, /required/],
    [{ date: '' }, /YYYY-MM-DD/],
    [{ date: '11/11/2026' }, /YYYY-MM-DD/],
    [{ date: '2026-1-5' }, /YYYY-MM-DD/],
    [{ date: '2026-11-11T00:00' }, /YYYY-MM-DD/],
    [{ date: ['2026-11-11', '2026-11-12'] }, /required|string/i],
    [{ date: '2026-13-01' }, /not a valid calendar date/],
    [{ date: '2025-02-29' }, /not a valid calendar date/],
    [{ date: '2026-04-31' }, /not a valid calendar date/],
    [{ date: '0000-01-01' }, /Year/],
    [{ date: '2026-11-11', afterSunset: 'yes' }, /afterSunset/],
  ])('rejects %j', (input, message) => {
    expect(() => parseConvertQuery(input)).toThrow(ValidationError);
    expect(() => parseConvertQuery(input)).toThrow(message);
  });
});

describe('isRealCalendarDate', () => {
  it('handles leap years', () => {
    expect(isRealCalendarDate(2024, 2, 29)).toBe(true);
    expect(isRealCalendarDate(2023, 2, 29)).toBe(false);
    expect(isRealCalendarDate(1900, 2, 29)).toBe(false); // divisible by 100, not by 400
    expect(isRealCalendarDate(2000, 2, 29)).toBe(true); // divisible by 400
  });
});

describe('toIsoDate', () => {
  it('zero-pads', () => {
    expect(toIsoDate({ year: 33, month: 1, day: 5 })).toBe('0033-01-05');
  });
});
