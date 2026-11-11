import { describe, expect, it } from 'vitest';
import {
  dayOfWeek,
  daysInMonth,
  isRealCalendarDate,
  isoDatesOfMonth,
  toIsoDate,
} from '../../src/lib/dates.js';

describe('date helpers', () => {
  it('handles leap years', () => {
    expect(isRealCalendarDate(2024, 2, 29)).toBe(true);
    expect(isRealCalendarDate(2023, 2, 29)).toBe(false);
    expect(isRealCalendarDate(1900, 2, 29)).toBe(false); // divisible by 100, not by 400
    expect(isRealCalendarDate(2000, 2, 29)).toBe(true); // divisible by 400
  });

  it('knows month lengths', () => {
    expect([1, 2, 4, 12].map((m) => daysInMonth(2026, m))).toEqual([31, 28, 30, 31]);
  });

  it('zero-pads ISO dates', () => {
    expect(toIsoDate({ year: 33, month: 1, day: 5 })).toBe('0033-01-05');
  });

  it('computes the weekday, also for years below 100', () => {
    expect(dayOfWeek(2026, 11, 11)).toBe(3); // Wednesday
    expect(dayOfWeek(2026, 11, 1)).toBe(0); // Sunday
    expect(dayOfWeek(33, 1, 1)).not.toBe(dayOfWeek(1933, 1, 1));
  });

  it('lists every date of a month', () => {
    const feb = isoDatesOfMonth(2024, 2);
    expect(feb).toHaveLength(29);
    expect(feb[0]).toBe('2024-02-01');
    expect(feb.at(-1)).toBe('2024-02-29');
  });
});
