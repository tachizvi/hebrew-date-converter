import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { TtlCache } from '../../src/lib/cache.js';
import { ConverterService } from '../../src/services/converterService.js';
import { createHebcalClient } from '../../src/services/hebcalClient.js';
import { createHebcalHolidaysClient } from '../../src/services/hebcalHolidaysClient.js';
import { WorkdayService } from '../../src/services/workdayService.js';
import type { HebrewDateDto, MonthCalendarDto, WorkdayDto } from '../../src/types/dto.js';
import {
  hangingFetch,
  hebcalKislev1,
  fakeHebcal,
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
  const workdayService = new WorkdayService(
    createHebcalHolidaysClient({
      holidaysUrl: 'https://hebcal.test/hebcal',
      timeoutMs,
      retries: 0,
      logger: silentLogger,
      fetchFn,
    }),
    new TtlCache<Map<string, WorkdayDto>>(60_000, 10),
    silentLogger,
  );
  return createApp({ converterService: service, workdayService, logger: silentLogger });
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

describe('GET /api/convert-hebrew', () => {
  it('converts a Hebrew date to Gregorian', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalKislev1));
    const res = await request(buildApp(fetchFn)).get(
      '/api/convert-hebrew?year=5787&month=Kislev&day=1',
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      gregorian: { date: '2026-11-11' },
      hebrew: { year: 5787, month: 'Kislev', day: 1 },
      cached: false,
    });
  });

  it('caches the conversion', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalKislev1));
    const app = buildApp(fetchFn);
    await request(app).get('/api/convert-hebrew?year=5787&month=Kislev&day=1');
    const second = await request(app).get('/api/convert-hebrew?year=5787&month=Kislev&day=1');
    expect(second.body.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for Adar in a leap year without calling Hebcal', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const res = await request(buildApp(fetchFn)).get(
      '/api/convert-hebrew?year=5787&month=Adar&day=1',
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/leap year/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes Hebcal's day-range rejection on as a 400", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: 'Hebrew day 30 out of valid range 1-29 for Elul 5787' }, 400),
    );
    const res = await request(buildApp(fetchFn)).get(
      '/api/convert-hebrew?year=5787&month=Elul&day=30',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_DATE',
      message: 'Hebrew day 30 out of valid range 1-29 for Elul 5787',
    });
  });
});

describe('workday routes', () => {
  it('GET /api/workday explains a non-working day', async () => {
    const res = await request(buildApp(fakeHebcal())).get('/api/workday?date=2026-09-21');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isWorkday: false, dayType: 'holiday', reason: 'Yom Kippur' });
  });

  it('GET /api/workday/month returns every day', async () => {
    const res = await request(buildApp(fakeHebcal())).get('/api/workday/month?month=2026-09');
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(30);
  });

  it('GET /api/workday/add returns the date after N business days', async () => {
    const res = await request(buildApp(fakeHebcal())).get(
      '/api/workday/add?date=2026-09-10&days=3',
    );
    expect(res.status).toBe(200);
    expect(res.body.result.date).toBe('2026-09-16');
    expect(res.body.skipped).toHaveLength(3);
  });

  it.each([
    '/api/workday?date=1900-01-01',
    '/api/workday?date=2026-02-30',
    '/api/workday/add?date=2026-09-10&days=0',
    '/api/workday/add?date=2026-09-10&days=101',
    '/api/workday/add?date=2026-09-10',
  ])('%s -> 400 without calling Hebcal', async (path) => {
    const fetchFn = fakeHebcal();
    const res = await request(buildApp(fetchFn)).get(path);
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns 502 when the holiday service is down', async () => {
    const res = await request(buildApp(vi.fn(async () => jsonResponse({}, 503)))).get(
      '/api/workday?date=2026-09-21',
    );
    expect(res.status).toBe(502);
  });
});

describe('POST /api/convert/batch', () => {
  const post = (app: ReturnType<typeof buildApp>, body: unknown) =>
    request(app)
      .post('/api/convert/batch')
      .send(body as object);

  it('converts every date, with per-item errors (partial success)', async () => {
    const res = await post(buildApp(fakeHebcal()), {
      dates: ['2026-11-11', '2025-02-30', 'abc'],
    });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total: 3, succeeded: 1, failed: 2, uniqueConverted: 1 });
    expect(res.body.results.map((r: { input: string; ok: boolean }) => [r.input, r.ok])).toEqual([
      ['2026-11-11', true],
      ['2025-02-30', false],
      ['abc', false],
    ]);
    expect(res.body.results[0].result.hebrew.month).toBe('Kislev');
    expect(res.body.results[1].error.code).toBe('INVALID_DATE');
  });

  it('converts duplicates once', async () => {
    const fetchFn = fakeHebcal();
    const res = await post(buildApp(fetchFn), {
      dates: ['2026-11-11', '2026-11-11', '2026-11-11'],
    });
    expect(res.body.summary.succeeded).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('runs at most 4 Hebcal calls at a time', async () => {
    let running = 0;
    let maxRunning = 0;
    const fetchFn = vi.fn<typeof fetch>(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return jsonResponse(hebcalKislev1);
    });
    const dates = Array.from({ length: 12 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
    const res = await post(buildApp(fetchFn), { dates });
    expect(res.body.summary.succeeded).toBe(12);
    expect(maxRunning).toBe(4);
  });

  it('reports an upstream outage per item', async () => {
    const res = await post(buildApp(vi.fn(async () => jsonResponse({}, 503))), {
      dates: ['2026-11-11'],
    });
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({
      ok: false,
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });

  it.each([
    [{}, /dates/],
    [{ dates: [] }, /at least one/],
    [{ dates: Array(101).fill('2026-01-01') }, /at most 100/],
    [{ dates: [1, 2] }, /Body must be|string/],
  ])('rejects body %j with 400', async (body, message) => {
    const res = await post(buildApp(fakeHebcal()), body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(res.body.error.message).toMatch(message);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await request(buildApp(fakeHebcal()))
      .post('/api/convert/batch')
      .set('Content-Type', 'application/json')
      .send('{"dates": [');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects an oversized body with 413', async () => {
    const res = await post(buildApp(fakeHebcal()), { dates: Array(3000).fill('2026-01-01') });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('lang parameter', () => {
  it('passes lang=he to Hebcal and caches each language separately', async () => {
    const fetchFn = fakeHebcal();
    const app = buildApp(fetchFn);
    await request(app).get('/api/convert?date=2026-11-11&lang=he');
    const en = await request(app).get('/api/convert?date=2026-11-11');
    const heAgain = await request(app).get('/api/convert?date=2026-11-11&lang=he');
    expect(en.body.cached).toBe(false);
    expect(heAgain.body.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchFn.mock.calls[0]![0])).searchParams.get('lg')).toBe('he');
  });

  it('accepts lang in the batch body', async () => {
    const fetchFn = fakeHebcal();
    const res = await request(buildApp(fetchFn))
      .post('/api/convert/batch')
      .send({ dates: ['2026-11-11'], lang: 'he' });
    expect(res.status).toBe(200);
    expect(new URL(String(fetchFn.mock.calls[0]![0])).searchParams.get('lg')).toBe('he');
  });

  it.each(['/api/convert?date=2026-11-11&lang=fr', '/api/calendar?month=2026-11&lang=xx'])(
    '%s -> 400 INVALID_REQUEST',
    async (path) => {
      const res = await request(buildApp(fakeHebcal())).get(path);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    },
  );
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
