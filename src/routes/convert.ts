import { Router } from 'express';
import type { ConverterService } from '../services/converterService.js';
import { parseConvertQuery } from '../validation/dateQuery.js';

/**
 * GET /api/convert?date=YYYY-MM-DD[&afterSunset=true]
 *
 * The route is thin on purpose: parse input -> call the service -> send JSON.
 * Errors thrown here (sync or async) reach the error middleware automatically
 * (Express 5 forwards rejected promises).
 */
export function convertRouter(service: ConverterService): Router {
  const router = Router();

  router.get('/convert', async (req, res) => {
    const query = parseConvertQuery(req.query);
    const result = await service.convert(query);
    req.log.info(
      { date: result.gregorian.date, afterSunset: query.afterSunset, cached: result.cached },
      'converted date',
    );
    res.json(result);
  });

  return router;
}
