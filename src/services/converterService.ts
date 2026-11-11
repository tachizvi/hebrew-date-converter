import type { TtlCache } from '../lib/cache.js';
import type { Logger } from '../lib/logger.js';
import { toIsoDate } from '../lib/dates.js';
import type {
  CalendarQuery,
  CalendarResponse,
  ConvertQuery,
  ConvertResponse,
  HebrewDateDto,
  HebrewDateQuery,
  Lang,
  MonthCalendarDto,
} from '../types/dto.js';
import type { HebcalClient } from './hebcalClient.js';

/**
 * Business layer: "convert a date", with caching. It knows nothing about HTTP
 * (no req/res), and nothing about how Hebcal is called - both are injected.
 *
 * A Gregorian -> Hebrew conversion never changes, so caching is safe; Hebcal
 * itself sends `Cache-Control: max-age=31536000` (one year). Errors are never
 * cached, so a temporary outage does not stick.
 */
export interface ConverterCaches {
  dates: TtlCache<HebrewDateDto>;
  months: TtlCache<MonthCalendarDto>;
}

export class ConverterService {
  constructor(
    private readonly client: HebcalClient,
    private readonly caches: ConverterCaches,
    private readonly logger: Logger,
  ) {}

  async convert(query: ConvertQuery, lang: Lang = 'en'): Promise<ConvertResponse> {
    const key = `${toIsoDate(query)}|${query.afterSunset ? 'after' : 'before'}|${lang}`;

    const hit = this.caches.dates.get(key);
    if (hit) {
      this.logger.debug({ key }, 'cache hit');
      return { ...hit, source: 'hebcal', cached: true };
    }

    this.logger.debug({ key }, 'cache miss');
    const dto = await this.client.convert(query, lang);
    this.caches.dates.set(key, dto);
    return { ...dto, source: 'hebcal', cached: false };
  }

  /** Hebrew -> Gregorian, cached in the same date cache under its own key prefix. */
  async convertFromHebrew(query: HebrewDateQuery, lang: Lang = 'en'): Promise<ConvertResponse> {
    const key = `h2g|${query.year}-${query.month}-${query.day}|${lang}`;

    const hit = this.caches.dates.get(key);
    if (hit) {
      this.logger.debug({ key }, 'cache hit');
      return { ...hit, source: 'hebcal', cached: true };
    }

    this.logger.debug({ key }, 'cache miss');
    const dto = await this.client.convertFromHebrew(query, lang);
    this.caches.dates.set(key, dto);
    return { ...dto, source: 'hebcal', cached: false };
  }

  /** A whole month for the calendar view: one Hebcal range call, cached per month. */
  async getMonth(query: CalendarQuery, lang: Lang = 'en'): Promise<CalendarResponse> {
    const key = `${toIsoDate({ ...query, day: 1 }).slice(0, 7)}|${lang}`;

    const hit = this.caches.months.get(key);
    if (hit) {
      this.logger.debug({ key }, 'month cache hit');
      return { ...hit, source: 'hebcal', cached: true };
    }

    this.logger.debug({ key }, 'month cache miss');
    const month = await this.client.convertMonth(query, lang);
    this.caches.months.set(key, month);
    return { ...month, source: 'hebcal', cached: false };
  }
}
