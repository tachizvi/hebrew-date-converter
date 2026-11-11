import { Router } from 'express';
import type { ConverterService } from '../services/converterService.js';
import type { WorkdayService } from '../services/workdayService.js';
import {
  parseAddWorkdaysQuery,
  parseConvertQuery,
  parseWorkdayMonthQuery,
  parseWorkdayQuery,
} from '../validation/dateQuery.js';

/**
 * Israeli business-day endpoints:
 *   GET /api/workday?date=YYYY-MM-DD           is this a workday, and if not, why
 *   GET /api/workday/month?month=YYYY-MM       the same for every day of a month
 *   GET /api/workday/add?date=YYYY-MM-DD&days=N  date after N business days (+ its Hebrew date)
 */
export function workdayRouter(service: WorkdayService, converter: ConverterService): Router {
  const router = Router();

  router.get('/workday', async (req, res) => {
    res.json(await service.getDay(parseWorkdayQuery(req.query)));
  });

  router.get('/workday/month', async (req, res) => {
    const { year, month } = parseWorkdayMonthQuery(req.query);
    res.json(await service.getMonth(year, month));
  });

  router.get('/workday/add', async (req, res) => {
    const { date, days } = parseAddWorkdaysQuery(req.query);
    const result = await service.addWorkdays(date, days);

    // Add the Hebrew date of the result. It's extra information, so if the
    // converter is down the answer still comes back, with resultHebrew: null.
    try {
      const converted = await converter.convert(parseConvertQuery({ date: result.result.date }));
      result.resultHebrew = converted.hebrew;
    } catch (err) {
      req.log.warn({ err }, 'could not add the hebrew date to the workday result');
    }

    req.log.info({ from: date, days, result: result.result.date }, 'added workdays');
    res.json(result);
  });

  return router;
}
