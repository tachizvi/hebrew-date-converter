import { describe, expect, it, vi } from 'vitest';
import {
  ValidationError,
  UpstreamBadResponseError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../../src/lib/errors.js';
import { createHebcalClient } from '../../src/services/hebcalClient.js';
import {
  hangingFetch,
  hebcalKislev1,
  hebcalRange,
  jsonResponse,
  silentLogger,
} from '../helpers.js';

const query = { year: 2026, month: 11, day: 11, afterSunset: false };

function client(fetchFn: typeof fetch, overrides: { retries?: number; timeoutMs?: number } = {}) {
  return createHebcalClient({
    baseUrl: 'https://hebcal.test/converter',
    timeoutMs: overrides.timeoutMs ?? 1_000,
    retries: overrides.retries ?? 1,
    retryDelayMs: 0,
    logger: silentLogger,
    fetchFn,
  });
}

describe('hebcalClient', () => {
  it('builds the Hebcal URL and maps the response to our DTO', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalKislev1));

    const dto = await client(fetchFn).convert(query);

    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      cfg: 'json',
      g2h: '1',
      gy: '2026',
      gm: '11',
      gd: '11',
    });
    expect(dto).toEqual({
      gregorian: { date: '2026-11-11', afterSunset: false },
      hebrew: {
        year: 5787,
        month: 'Kislev',
        day: 1,
        hebrewText: 'א׳ בְּכִסְלֵו תשפ״ז',
        parts: { day: 'א׳', month: 'כסלו', year: 'תשפ״ז' },
      },
      events: ['Rosh Chodesh Kislev', 'Parashat Toldot'],
    });
  });

  it('sends gs=on when afterSunset is requested', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ...hebcalKislev1, afterSunset: true }),
    );
    await client(fetchFn).convert({ ...query, afterSunset: true });
    expect(new URL(String(fetchFn.mock.calls[0]![0])).searchParams.get('gs')).toBe('on');
  });

  it('defaults events to an empty list when Hebcal omits them', async () => {
    const { events: _events, ...withoutEvents } = hebcalKislev1;
    const dto = await client(vi.fn(async () => jsonResponse(withoutEvents))).convert(query);
    expect(dto.events).toEqual([]);
  });

  it('retries once on a 5xx, then succeeds', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 503))
      .mockResolvedValueOnce(jsonResponse(hebcalKislev1));
    const dto = await client(fetchFn).convert(query);
    expect(dto.hebrew.month).toBe('Kislev');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured retries on repeated 5xx', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({}, 500));
    await expect(client(fetchFn, { retries: 2 }).convert(query)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('maps network failures to UpstreamUnavailableError', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client(fetchFn, { retries: 0 }).convert(query)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it('times out a hung request and does not retry it', async () => {
    const fetchFn = hangingFetch();
    await expect(client(fetchFn, { timeoutMs: 20 }).convert(query)).rejects.toBeInstanceOf(
      UpstreamTimeoutError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 4xx and surfaces Hebcal's message", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: 'Gregorian day 30 out of valid range for 2/2025' }, 400),
    );
    const promise = client(fetchFn).convert(query);
    await expect(promise).rejects.toBeInstanceOf(UpstreamBadResponseError);
    await expect(promise).rejects.toThrow(/out of valid range/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-JSON body', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response('<html>oops</html>', { status: 200 }),
    );
    await expect(client(fetchFn).convert(query)).rejects.toBeInstanceOf(UpstreamBadResponseError);
  });

  it('rejects a payload that does not match the expected schema', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ ...hebcalKislev1, hy: 'five' }));
    await expect(client(fetchFn).convert(query)).rejects.toThrow(/unexpected payload/);
  });
});

describe('hebcalClient.convertMonth (range mode)', () => {
  it('requests the whole month in one call and maps every day', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalRange(2026, 11)));

    const month = await client(fetchFn).convertMonth({ year: 2026, month: 11 });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      cfg: 'json',
      g2h: '1',
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(month.month).toBe('2026-11');
    expect(month.days).toHaveLength(30);
    expect(month.days[0]).toMatchObject({ date: '2026-11-01', weekday: 0 });
    expect(month.days[10]).toMatchObject({
      date: '2026-11-11',
      weekday: 3,
      hebrew: { month: 'Cheshvan', day: 11, parts: { month: 'חשון' } },
      events: ['Rosh Chodesh Kislev'],
    });
  });

  it('handles February in a leap year', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalRange(2028, 2)));
    const month = await client(fetchFn).convertMonth({ year: 2028, month: 2 });
    expect(new URL(String(fetchFn.mock.calls[0]![0])).searchParams.get('end')).toBe('2028-02-29');
    expect(month.days).toHaveLength(29);
  });

  it('rejects a truncated range instead of returning a calendar with holes', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(hebcalRange(2026, 11, { omit: ['2026-11-29', '2026-11-30'] })),
    );
    await expect(client(fetchFn).convertMonth({ year: 2026, month: 11 })).rejects.toThrow(
      /28 of 30 days/,
    );
  });

  it('rejects a single-date payload where a range was expected', async () => {
    // Hebcal answers start > end with a single-date object - a different shape.
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalKislev1));
    await expect(client(fetchFn).convertMonth({ year: 2026, month: 11 })).rejects.toBeInstanceOf(
      UpstreamBadResponseError,
    );
  });

  it('retries a 5xx in range mode too', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 502))
      .mockResolvedValueOnce(jsonResponse(hebcalRange(2026, 11)));
    const month = await client(fetchFn).convertMonth({ year: 2026, month: 11 });
    expect(month.days).toHaveLength(30);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('hebcalClient.convertFromHebrew (h2g)', () => {
  const hq = { year: 5787, month: 'Kislev' as const, day: 1 };

  it('calls h2g with the Hebrew date and maps the Gregorian result', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(hebcalKislev1));

    const dto = await client(fetchFn).convertFromHebrew(hq);

    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      cfg: 'json',
      h2g: '1',
      hy: '5787',
      hm: 'Kislev',
      hd: '1',
    });
    expect(dto.gregorian.date).toBe('2026-11-11');
    expect(dto.hebrew).toMatchObject({ year: 5787, month: 'Kislev', day: 1 });
  });

  it("turns Hebcal's 400 (e.g. day 30 of a 29-day month) into a ValidationError", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: 'Hebrew day 30 out of valid range 1-29 for Elul 5787' }, 400),
    );
    const promise = client(fetchFn).convertFromHebrew({ year: 5787, month: 'Elul', day: 30 });
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toThrow('Hebrew day 30 out of valid range 1-29 for Elul 5787');
  });

  it('rejects an answer for a different month than requested (silent re-mapping)', async () => {
    // What Hebcal does for "Adar" in a leap year: it answers for Adar II.
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ...hebcalKislev1, hm: 'Adar II', gy: 2027, gm: 3, gd: 10 }),
    );
    await expect(
      client(fetchFn).convertFromHebrew({ year: 5787, month: 'Adar1', day: 1 }),
    ).rejects.toThrow(/instead of 1 Adar I 5787/);
  });

  it('maps the Hebcal month spelling (Shvat -> "Sh\'vat")', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ...hebcalKislev1, hm: "Sh'vat", hd: 15, gy: 2027, gm: 1, gd: 23 }),
    );
    const dto = await client(fetchFn).convertFromHebrew({ year: 5787, month: 'Shvat', day: 15 });
    expect(dto.gregorian.date).toBe('2027-01-23');
  });

  it('still reports a 5xx as unavailable', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({}, 503));
    await expect(client(fetchFn, { retries: 0 }).convertFromHebrew(hq)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });
});

describe('hebcalClient language', () => {
  it('asks Hebcal for Hebrew event names with lg=he, in every mode', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      jsonResponse(String(input).includes('start=') ? hebcalRange(2026, 11) : hebcalKislev1),
    );
    const c = client(fetchFn);
    await c.convert(query, 'he');
    await c.convertFromHebrew({ year: 5787, month: 'Kislev', day: 1 }, 'he');
    await c.convertMonth({ year: 2026, month: 11 }, 'he');
    await c.convert(query); // default: English, no lg parameter
    const lg = fetchFn.mock.calls.map((call) => new URL(String(call[0])).searchParams.get('lg'));
    expect(lg).toEqual(['he', 'he', 'he', null]);
  });
});
