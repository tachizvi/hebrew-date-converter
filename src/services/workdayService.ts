import type { TtlCache } from '../lib/cache.js';
import { addDays, dayOfWeek, toIsoDate } from '../lib/dates.js';
import type { Logger } from '../lib/logger.js';
import type { AddWorkdaysDto, DayType, WorkdayDto, WorkdayMonthDto } from '../types/dto.js';
import type { HebcalHolidaysClient, Holiday } from './hebcalHolidaysClient.js';

/** Hebcal spells it "Yom HaAtzma’ut" (curly apostrophe); match it loosely. */
const INDEPENDENCE_DAY = /^Yom HaAtzma.?ut$/i;
const CHOL_HAMOED = /CH[’'‘]{2}M/;

/** A full day off: Yom Tov, or Independence Day (a statutory rest day in Israel). */
function isDayOff(h: Holiday): boolean {
  return h.yomtov || INDEPENDENCE_DAY.test(h.title);
}

/**
 * Israeli workday rules on top of Hebcal's holiday list.
 *
 * Business rules (documented in the README):
 * - Work week is Sunday-Thursday; Friday and Saturday are the weekend.
 * - Yom Tov days and Yom HaAtzma'ut are days off.
 * - The day before a day off is a holiday eve: a workday, usually shortened.
 * - Chol HaMoed is a workday (many places work reduced hours).
 *
 * Hebcal is called once per Gregorian year; the computed year is cached.
 */
export class WorkdayService {
  constructor(
    private readonly client: HebcalHolidaysClient,
    private readonly cache: TtlCache<Map<string, WorkdayDto>>,
    private readonly logger: Logger,
  ) {}

  async getDay(date: string): Promise<WorkdayDto> {
    const year = await this.getYear(Number(date.slice(0, 4)));
    return year.get(date)!;
  }

  async getMonth(year: number, month: number): Promise<WorkdayMonthDto> {
    const days = await this.getYear(year);
    const prefix = toIsoDate({ year, month, day: 1 }).slice(0, 7);
    return { month: prefix, days: [...days.values()].filter((d) => d.date.startsWith(prefix)) };
  }

  /**
   * The date reached after `workdays` working days, counting from the day after
   * `from` - the usual meaning of "delivered within N business days".
   */
  async addWorkdays(from: string, workdays: number): Promise<AddWorkdaysDto> {
    const skipped: WorkdayDto[] = [];
    let date = from;
    let counted = 0;
    let day: WorkdayDto;

    do {
      date = addDays(date, 1);
      day = await this.getDay(date);
      if (day.isWorkday) counted++;
      else skipped.push(day);
    } while (counted < workdays);

    return { from, workdays, result: day, resultHebrew: null, skipped };
  }

  private async getYear(year: number): Promise<Map<string, WorkdayDto>> {
    const key = String(year);
    const hit = this.cache.get(key);
    if (hit) return hit;

    // One extra day so the eve check works for Dec 31 as well.
    const start = toIsoDate({ year, month: 1, day: 1 });
    const end = toIsoDate({ year: year + 1, month: 1, day: 1 });
    const holidays = await this.client.getIsraeliHolidays(start, end);
    this.logger.debug({ year, holidays: holidays.length }, 'loaded israeli holidays');

    const byDate = new Map<string, Holiday[]>();
    for (const h of holidays) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h]);

    const days = new Map<string, WorkdayDto>();
    for (let date = start; date < end; date = addDays(date, 1)) {
      days.set(date, this.classify(date, byDate));
    }
    this.cache.set(key, days);
    return days;
  }

  private classify(date: string, byDate: Map<string, Holiday[]>): WorkdayDto {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const weekday = dayOfWeek(y, m, d);
    const today = byDate.get(date) ?? [];
    const dayOff = today.find(isDayOff);
    const tomorrowOff = (byDate.get(addDays(date, 1)) ?? []).find(isDayOff);
    const cholHamoed = today.find((h) => CHOL_HAMOED.test(h.title));

    const result = (dayType: DayType, reason: string | null, hebrewReason: string | null) => ({
      date,
      weekday,
      isWorkday: dayType === 'workday' || dayType === 'holiday_eve' || dayType === 'chol_hamoed',
      dayType,
      reason,
      hebrewReason,
    });

    // Order matters: a holiday on Shabbat is reported as the holiday.
    if (dayOff) return result('holiday', dayOff.title, dayOff.hebrewTitle);
    if (weekday === 6) return result('weekend', 'Shabbat', 'שבת');
    if (weekday === 5) return result('weekend', 'Friday', 'יום שישי');
    if (tomorrowOff) {
      return result(
        'holiday_eve',
        `Eve of ${tomorrowOff.title}`,
        tomorrowOff.hebrewTitle ? `ערב ${tomorrowOff.hebrewTitle}` : null,
      );
    }
    if (cholHamoed) return result('chol_hamoed', cholHamoed.title, cholHamoed.hebrewTitle);
    return result('workday', null, null);
  }
}
