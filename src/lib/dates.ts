/**
 * Small, dependency-free Gregorian date helpers. Everything works on plain
 * numbers / ISO strings in UTC, so the server's time zone never matters.
 */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** True only for dates that exist in the calendar (rejects 2025-02-30, 2023-02-29...). */
export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Formats numbers as YYYY-MM-DD (zero-padded, also for years < 1000). */
export function toIsoDate({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}): string {
  const pad = (n: number, len: number) => String(n).padStart(len, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Day of week, 0 = Sunday ... 6 = Saturday.
 * Uses setUTCFullYear because `new Date(Date.UTC(33, 0, 1))` would mean 1933.
 */
export function dayOfWeek(year: number, month: number, day: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getUTCDay();
}

/** Every ISO date of a Gregorian month, in order. */
export function isoDatesOfMonth(year: number, month: number): string[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) =>
    toIsoDate({ year, month, day: i + 1 }),
  );
}

/** ISO date plus/minus whole days, e.g. addDays('2026-12-31', 1) -> '2027-01-01'. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d + days);
  return toIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}
