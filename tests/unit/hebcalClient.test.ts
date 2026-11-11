import { describe, expect, it, vi } from 'vitest';
import {
  UpstreamBadResponseError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from '../../src/lib/errors.js';
import { createHebcalClient } from '../../src/services/hebcalClient.js';
import { hangingFetch, hebcalKislev1, jsonResponse, silentLogger } from '../helpers.js';

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
