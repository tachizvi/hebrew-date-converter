import { Router } from 'express';
import type { ConverterService } from '../services/converterService.js';
import { parseCalendarQuery, parseLang } from '../validation/dateQuery.js';

/**
 * GET /api/calendar?month=YYYY-MM
 *
 * Every day of a Gregorian month with its Hebrew date and events, fetched from
 * Hebcal with a single range request instead of ~30 single-date requests.
 */
export function calendarRouter(service: ConverterService): Router {
  const router = Router();

  router.get('/calendar', async (req, res) => {
    const query = parseCalendarQuery(req.query);
    const result = await service.getMonth(query, parseLang(req.query));
    req.log.info({ month: result.month, cached: result.cached }, 'built month calendar');
    res.json(result);
  });

  return router;
}
