import { Router } from 'express';
import type { WorkdayService } from '../services/workdayService.js';
import {
  parseAddWorkdaysQuery,
  parseWorkdayMonthQuery,
  parseWorkdayQuery,
} from '../validation/dateQuery.js';

/**
 * Israeli business-day endpoints:
 *   GET /api/workday?date=YYYY-MM-DD           is this a workday, and if not, why
 *   GET /api/workday/month?month=YYYY-MM       the same for every day of a month
 *   GET /api/workday/add?date=YYYY-MM-DD&days=N  date after N business days
 */
export function workdayRouter(service: WorkdayService): Router {
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
    req.log.info({ from: date, days, result: result.result.date }, 'added workdays');
    res.json(result);
  });

  return router;
}
