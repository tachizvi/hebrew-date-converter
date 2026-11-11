import express, { Router } from 'express';
import { z } from 'zod';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { AppError, InvalidRequestError } from '../lib/errors.js';
import type { ConverterService } from '../services/converterService.js';
import type { BatchItemResult, BatchResponse, ConvertResponse } from '../types/dto.js';
import { parseConvertQuery } from '../validation/dateQuery.js';

export const MAX_BATCH_SIZE = 100;
/** Parallel Hebcal calls per batch: fast enough, polite to a free public API. */
const BATCH_CONCURRENCY = 4;

const bodySchema = z.object({
  dates: z
    .array(z.string(), { error: 'Body must be {"dates": ["YYYY-MM-DD", ...]}' })
    .min(1, '"dates" must contain at least one date')
    .max(MAX_BATCH_SIZE, `"dates" can contain at most ${MAX_BATCH_SIZE} dates`),
});

/**
 * POST /api/convert/batch   body: {"dates": ["2026-11-11", "2026-02-30", ...]}
 *
 * Converts many Gregorian dates in one request - the typical system-to-system
 * case (e.g. an HR system converting employee birthdays).
 * - Partial success: one bad date doesn't fail the batch. Every input gets its
 *   own result (`ok: true` + result, or `ok: false` + error), in input order.
 * - Duplicates are converted once; with the cache, repeats cost nothing.
 * - At most BATCH_CONCURRENCY Hebcal calls run at the same time.
 * The batch itself is 200 unless the request is malformed (400 / 413).
 */
export function batchRouter(service: ConverterService): Router {
  const router = Router();

  router.post('/convert/batch', express.json({ limit: '16kb' }), async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InvalidRequestError(parsed.error.issues[0]?.message ?? 'Invalid body');
    }
    const inputs = parsed.data.dates.map((d) => d.trim());

    // Convert each distinct date once.
    const unique = [...new Set(inputs)];
    const outcomes = new Map<string, BatchItemResult>();
    await mapWithConcurrency(unique, BATCH_CONCURRENCY, async (input) => {
      outcomes.set(input, await convertOne(service, input));
    });

    const results = inputs.map((input) => ({ ...outcomes.get(input)!, input }));
    const succeeded = results.filter((r) => r.ok).length;
    const body: BatchResponse = {
      results,
      summary: {
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        uniqueConverted: [...outcomes.values()].filter((o) => o.ok).length,
      },
    };
    req.log.info(body.summary, 'batch converted');
    res.json(body);
  });

  return router;
}

async function convertOne(service: ConverterService, input: string): Promise<BatchItemResult> {
  try {
    const result: ConvertResponse = await service.convert(parseConvertQuery({ date: input }));
    return { input, ok: true, result };
  } catch (err) {
    if (err instanceof AppError) {
      return { input, ok: false, error: { code: err.code, message: err.message } };
    }
    return { input, ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
  }
}
