import { z } from 'zod';
import { createHebcalHttp, type HebcalHttpOptions } from './hebcalHttp.js';

/**
 * Client for Hebcal's Jewish calendar endpoint (/hebcal), used for the Israeli
 * holiday list behind the workday rules. Only the fields we use are validated.
 */
const holidayItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  hebrew: z.string().optional(),
  category: z.string(),
  subcat: z.string().optional(),
  /** true on full holidays (no work): Rosh Hashana, Yom Kippur, Pesach I/VII... */
  yomtov: z.boolean().optional(),
});

const holidaysResponseSchema = z.object({
  items: z.array(holidayItemSchema),
});

export interface Holiday {
  date: string;
  title: string;
  hebrewTitle: string | null;
  yomtov: boolean;
  /** major | minor | modern ... */
  subcat: string | null;
}

export interface HebcalHolidaysOptions extends HebcalHttpOptions {
  /** Hebcal's calendar endpoint, e.g. https://www.hebcal.com/hebcal */
  holidaysUrl: string;
}

export interface HebcalHolidaysClient {
  /** Israeli holidays between two ISO dates (inclusive). */
  getIsraeliHolidays(start: string, end: string): Promise<Holiday[]>;
}

export function createHebcalHolidaysClient(options: HebcalHolidaysOptions): HebcalHolidaysClient {
  const { fetchValidated } = createHebcalHttp(options);

  return {
    async getIsraeliHolidays(start, end) {
      const url = new URL(options.holidaysUrl);
      const params: Record<string, string> = {
        v: '1',
        cfg: 'json',
        i: 'on', // Israel schedule: one day of Yom Tov, Israeli Torah readings
        maj: 'on', // major holidays
        mod: 'on', // modern holidays (Yom HaAtzma'ut is a statutory day off)
        min: 'off',
        nx: 'off', // no Rosh Chodesh
        mf: 'off',
        ss: 'off',
        c: 'off', // no candle-lighting times
        s: 'off', // no Torah portions
        start,
        end,
      };
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

      const body = await fetchValidated(url.toString(), holidaysResponseSchema);
      return body.items.map((i) => ({
        date: i.date,
        title: i.title,
        hebrewTitle: i.hebrew ?? null,
        yomtov: i.yomtov ?? false,
        subcat: i.subcat ?? null,
      }));
    },
  };
}
