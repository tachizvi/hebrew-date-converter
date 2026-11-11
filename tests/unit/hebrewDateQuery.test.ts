import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/lib/errors.js';
import { isHebrewLeapYear } from '../../src/lib/hebrewCalendar.js';
import { parseHebrewDateQuery } from '../../src/validation/dateQuery.js';

describe('isHebrewLeapYear', () => {
  it('follows the 19-year cycle', () => {
    // 5784 and 5787 are leap years, 5785 and 5786 are not (checked against Hebcal).
    expect([5784, 5785, 5786, 5787].map(isHebrewLeapYear)).toEqual([true, false, false, true]);
    // Exactly 7 leap years in any 19-year cycle.
    const cycle = Array.from({ length: 19 }, (_, i) => isHebrewLeapYear(5770 + i));
    expect(cycle.filter(Boolean)).toHaveLength(7);
  });
});

describe('parseHebrewDateQuery', () => {
  it('parses a valid date', () => {
    expect(parseHebrewDateQuery({ year: '5787', month: 'Kislev', day: '1' })).toEqual({
      year: 5787,
      month: 'Kislev',
      day: 1,
    });
  });

  it('accepts the right Adar for the year', () => {
    expect(parseHebrewDateQuery({ year: '5785', month: 'Adar', day: '14' }).month).toBe('Adar');
    expect(parseHebrewDateQuery({ year: '5787', month: 'Adar2', day: '14' }).month).toBe('Adar2');
  });

  it.each([
    [{}, /year.*required|required/i],
    [{ year: '5787', month: 'Kislev' }, /day.*required/i],
    [{ year: '5787', month: 'Kislev', day: '' }, /day.*required/i],
    [{ year: '5787', month: 'Kislev', day: '31' }, /between 1 and 30/],
    [{ year: '5787', month: 'Kislev', day: '0' }, /between 1 and 30/],
    [{ year: '5787', month: 'Kislev', day: '1.5' }, /whole number/],
    [{ year: '3000', month: 'Nisan', day: '1' }, /between 3762 and 9999/],
    [{ year: '5787', month: 'Kislv', day: '1' }, /must be one of/],
    [{ year: '5787', month: 'Adar', day: '1' }, /leap year: choose Adar1 or Adar2/],
    [{ year: '5785', month: 'Adar1', day: '1' }, /not a leap year/],
    [{ year: '5785', month: 'Adar2', day: '1' }, /not a leap year/],
  ])('rejects %j', (input, message) => {
    expect(() => parseHebrewDateQuery(input)).toThrow(ValidationError);
    expect(() => parseHebrewDateQuery(input)).toThrow(message);
  });
});
