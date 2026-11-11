import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/lib/errors.js';
import { parseCalendarQuery, parseConvertQuery } from '../../src/validation/dateQuery.js';

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

describe('parseCalendarQuery', () => {
  it('parses a valid month', () => {
    expect(parseCalendarQuery({ month: '2026-11' })).toEqual({ year: 2026, month: 11 });
  });

  it.each([
    [{}, /required/],
    [{ month: '2026-11-01' }, /YYYY-MM/],
    [{ month: '2026-1' }, /YYYY-MM/],
    [{ month: '2026-13' }, /between 01 and 12/],
    [{ month: '2026-00' }, /between 01 and 12/],
    [{ month: '0000-05' }, /Year/],
  ])('rejects %j', (input, message) => {
    expect(() => parseCalendarQuery(input)).toThrow(ValidationError);
    expect(() => parseCalendarQuery(input)).toThrow(message);
  });
});
