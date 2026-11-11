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
  hebrew: {
    year: number;
    /** Transliterated month name, e.g. "Kislev" */
    month: string;
    day: number;
    /** Full Hebrew date with nikud, e.g. "א׳ בְּכִסְלֵו תשפ״ז" */
    hebrewText: string;
    /** Hebrew-letter parts without nikud */
    parts: { day: string; month: string; year: string };
  };
  /** Holidays, Rosh Chodesh, weekly Torah portion etc. Empty if none. */
  events: string[];
}

/** What the API returns: the DTO plus metadata about how it was served. */
export interface ConvertResponse extends HebrewDateDto {
  source: 'hebcal';
  cached: boolean;
}

/** Validated input for a conversion. */
export interface ConvertQuery {
  year: number;
  month: number;
  day: number;
  afterSunset: boolean;
}
