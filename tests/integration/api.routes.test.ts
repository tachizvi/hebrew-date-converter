import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { TtlCache } from '../../src/lib/cache.js';
import { ConverterService } from '../../src/services/converterService.js';
import { createHebcalClient } from '../../src/services/hebcalClient.js';
import type { HebrewDateDto, MonthCalendarDto } from '../../src/types/dto.js';
import {
  hangingFetch,
  hebcalKislev1,
  hebcalRange,
  jsonResponse,
  silentLogger,
} from '../helpers.js';

/**
 * Full stack (route -> validation -> service -> cache -> Hebcal client ->
 * error middleware), with only the network replaced by a fake fetch.
 */
function buildApp(fetchFn: typeof fetch, timeoutMs = 1_000) {
  const client = createHebcalClient({
    baseUrl: 'https://hebcal.test/converter',
    timeoutMs,
    retries: 0,
    logger: silentLogger,
    fetchFn,
  });
  const service = new ConverterService(
    client,
    {
      dates: new TtlCache<HebrewDateDto>(60_000, 100),
      months: new TtlCache<MonthCalendarDto>(60_000, 100),
    },
    silentLogger,
  );
  return createApp({ converterService: service, logger: silentLogger });
}

describe('GET /api/convert', () => {
  it('returns the Hebrew date', async () => {
    const res = await request(buildApp(vi.fn(async () => jsonResponse(hebcalKislev1)))).get(
      '/api/convert?date=2026-11-11',
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      gregorian: { date: '2026-11-11', afterSunset: false },
      hebrew: { year: 5787, month: 'Kislev', day: 1, hebrewText: 'א׳ בְּכִסְלֵו תשפ״ז' },
      events: ['Rosh Chodesh Kislev', 'Parashat Toldot'],
      source: 'hebcal',
      cached: false,
    });
  });

  it('serves a repeated request from cache without calling Hebcal again', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalKislev1));
    const app = buildApp(fetchFn);
    await request(app).get('/api/convert?date=2026-11-11');
    const second = await request(app).get('/api/convert?date=2026-11-11');
    expect(second.body.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for an invalid date without calling Hebcal', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const res = await request(buildApp(fetchFn)).get('/api/convert?date=2025-02-30');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_DATE' });
    expect(res.body.error.requestId).toEqual(expect.any(String));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns 502 when Hebcal is down', async () => {
    const res = await request(buildApp(vi.fn(async () => jsonResponse({}, 503)))).get(
      '/api/convert?date=2026-11-11',
    );
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('returns 504 when Hebcal times out', async () => {
    const res = await request(buildApp(hangingFetch(), 20)).get('/api/convert?date=2026-11-11');
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('returns 502 when Hebcal sends an unexpected payload', async () => {
    const res = await request(buildApp(vi.fn(async () => jsonResponse({ hello: 'world' })))).get(
      '/api/convert?date=2026-11-11',
    );
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_BAD_RESPONSE');
  });

  it('echoes a caller-supplied X-Request-Id', async () => {
    const res = await request(buildApp(vi.fn()))
      .get('/api/convert?date=bad')
      .set('X-Request-Id', 'trace-123');
    expect(res.headers['x-request-id']).toBe('trace-123');
    expect(res.body.error.requestId).toBe('trace-123');
  });
});

describe('GET /api/calendar', () => {
  it('returns every day of the month with its Hebrew date', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalRange(2026, 11)));
    const res = await request(buildApp(fetchFn)).get('/api/calendar?month=2026-11');
    expect(res.status).toBe(200);
    expect(res.body.month).toBe('2026-11');
    expect(res.body.days).toHaveLength(30);
    expect(res.body.days[10]).toMatchObject({ date: '2026-11-11', weekday: 3 });
    expect(res.body.cached).toBe(false);
  });

  it('caches the month', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalRange(2026, 11)));
    const app = buildApp(fetchFn);
    await request(app).get('/api/calendar?month=2026-11');
    const second = await request(app).get('/api/calendar?month=2026-11');
    expect(second.body.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for an invalid month without calling Hebcal', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const res = await request(buildApp(fetchFn)).get('/api/calendar?month=2026-13');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DATE');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns 502 when Hebcal returns an incomplete range', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(hebcalRange(2026, 11, { omit: ['2026-11-30'] })),
    );
    const res = await request(buildApp(fetchFn)).get('/api/calendar?month=2026-11');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_BAD_RESPONSE');
  });
});

describe('other routes', () => {
  it('GET /api/health is ok', async () => {
    const res = await request(buildApp(vi.fn())).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('unknown /api routes return a JSON 404', async () => {
    const res = await request(buildApp(vi.fn())).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
