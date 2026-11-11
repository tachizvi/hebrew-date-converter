import type { TtlCache } from '../lib/cache.js';
import type { Logger } from '../lib/logger.js';
import { toIsoDate } from '../validation/dateQuery.js';
import type { ConvertQuery, ConvertResponse, HebrewDateDto } from '../types/dto.js';
import type { HebcalClient } from './hebcalClient.js';

/**
 * Business layer: "convert a date", with caching. It knows nothing about HTTP
 * (no req/res), and nothing about how Hebcal is called - both are injected.
 *
 * A Gregorian -> Hebrew conversion never changes, so caching is safe; Hebcal
 * itself sends `Cache-Control: max-age=31536000` (one year). Errors are never
 * cached, so a temporary outage does not stick.
 */
export class ConverterService {
  constructor(
    private readonly client: HebcalClient,
    private readonly cache: TtlCache<HebrewDateDto>,
    private readonly logger: Logger,
  ) {}

  async convert(query: ConvertQuery): Promise<ConvertResponse> {
    const key = `${toIsoDate(query)}|${query.afterSunset ? 'after' : 'before'}`;

    const hit = this.cache.get(key);
    if (hit) {
      this.logger.debug({ key }, 'cache hit');
      return { ...hit, source: 'hebcal', cached: true };
    }

    this.logger.debug({ key }, 'cache miss');
    const dto = await this.client.convert(query);
    this.cache.set(key, dto);
    return { ...dto, source: 'hebcal', cached: false };
  }
}
