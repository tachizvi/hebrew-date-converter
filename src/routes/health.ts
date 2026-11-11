import { Router } from 'express';

/** Liveness probe for load balancers / orchestrators. Does not call Hebcal. */
export function healthRouter(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });
  return router;
}
