import { vi } from 'vitest';
import { createLogger } from '../src/lib/logger.js';

export const silentLogger = createLogger('silent');

/** A real Hebcal response for 2026-11-11, captured with curl. */
export const hebcalKislev1 = {
  gy: 2026,
  gm: 11,
  gd: 11,
  afterSunset: false,
  hy: 5787,
  hm: 'Kislev',
  hd: 1,
  hebrew: 'א׳ בְּכִסְלֵו תשפ״ז',
  heDateParts: { y: 'תשפ״ז', m: 'כסלו', d: 'א׳' },
  events: ['Rosh Chodesh Kislev', 'Parashat Toldot'],
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fetch that never answers until it is aborted - simulates a hung upstream. */
export function hangingFetch() {
  return vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  );
}

/** A Hebcal range response (`?start=..&end=..`) for a whole month, shaped like the real one. */
export function hebcalRange(year: number, month: number, opts: { omit?: string[] } = {}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const hdates: Record<string, unknown> = {};
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`;
    if (opts.omit?.includes(date)) continue;
    hdates[date] = {
      hy: 5787,
      hm: 'Cheshvan',
      hd: d,
      hebrew: `${d} בְּחֶשְׁוָן תשפ״ז`,
      heDateParts: { y: 'תשפ״ז', m: 'חשון', d: String(d) },
      events: d === 11 ? ['Rosh Chodesh Kislev'] : [],
    };
  }
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(days)}`,
    hdates,
  };
}
