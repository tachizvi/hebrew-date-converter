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
