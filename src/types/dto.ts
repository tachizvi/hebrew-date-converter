import type { HebrewMonthCode } from '../lib/hebrewCalendar.js';

/**
 * The public contract of our API. It is deliberately independent of Hebcal's
 * field names (hy, hm, hd, heDateParts...) so we can change provider, or
 * Hebcal can change its payload, without breaking our clients.
 */
export interface HebrewDateDto {
  gregorian: {
    /** ISO date, YYYY-MM-DD */
    date: string;
    /** true if the conversion treats the date as after sunset (next Hebrew day) */
    afterSunset: boolean;
  };
  hebrew: HebrewPart;
  /** Holidays, Rosh Chodesh, weekly Torah portion etc. Empty if none. */
  events: string[];
}

export interface HebrewPart {
  year: number;
  /** Transliterated month name, e.g. "Kislev" */
  month: string;
  day: number;
  /** Full Hebrew date with nikud, e.g. "א׳ בְּכִסְלֵו תשפ״ז" */
  hebrewText: string;
  /** Hebrew-letter parts without nikud */
  parts: { day: string; month: string; year: string };
}

/** One day in a month calendar. */
export interface CalendarDayDto {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  hebrew: HebrewPart;
  events: string[];
}

/** A whole Gregorian month with the Hebrew date of every day. */
export interface MonthCalendarDto {
  /** YYYY-MM */
  month: string;
  days: CalendarDayDto[];
}

export interface CalendarResponse extends MonthCalendarDto {
  source: 'hebcal';
  cached: boolean;
}

/** What the API returns: the DTO plus metadata about how it was served. */
export interface ConvertResponse extends HebrewDateDto {
  source: 'hebcal';
  cached: boolean;
}

/**
 * Language for names Hebcal translates (holidays, Torah portions, Rosh Chodesh).
 * The Hebrew date itself (`hebrewText`, `parts`) is always in Hebrew.
 */
export type Lang = 'en' | 'he';

/** Validated input for a Hebrew -> Gregorian conversion. */
export interface HebrewDateQuery {
  year: number;
  /** Month code as Hebcal accepts it, e.g. "Kislev", "Adar1" */
  month: HebrewMonthCode;
  day: number;
}

/** Validated input for a month calendar. */
export interface CalendarQuery {
  year: number;
  month: number;
}

/** Validated input for a conversion. */
export interface ConvertQuery {
  year: number;
  month: number;
  day: number;
  afterSunset: boolean;
}

/**
 * - workday:      regular Sunday-Thursday
 * - holiday_eve:  day before a full holiday (shortened day, still a workday)
 * - chol_hamoed:  intermediate days of Pesach/Sukkot (workday, reduced hours common)
 * - weekend:      Friday or Saturday
 * - holiday:      full holiday / statutory day off (no work)
 */
export type DayType = 'workday' | 'holiday_eve' | 'chol_hamoed' | 'weekend' | 'holiday';

export interface WorkdayDto {
  date: string;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  isWorkday: boolean;
  dayType: DayType;
  /** Why the day is not a regular workday, e.g. "Yom Kippur"; null on regular workdays */
  reason: string | null;
  hebrewReason: string | null;
}

export interface WorkdayMonthDto {
  month: string;
  days: WorkdayDto[];
}

export interface AddWorkdaysDto {
  from: string;
  workdays: number;
  /** The date reached after counting `workdays` working days after `from` */
  result: WorkdayDto;
  /** Non-working days that were skipped on the way */
  skipped: WorkdayDto[];
}

export type BatchItemResult =
  | { input: string; ok: true; result: ConvertResponse }
  | { input: string; ok: false; error: { code: string; message: string } };

export interface BatchResponse {
  results: BatchItemResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    /** Distinct valid dates actually converted (duplicates are converted once) */
    uniqueConverted: number;
  };
}
