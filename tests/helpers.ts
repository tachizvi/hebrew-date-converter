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

/** Israeli holidays as Hebcal's /hebcal endpoint returns them (subset, real titles and dates). */
export const israeliHolidays2026 = [
  {
    date: '2026-04-21',
    title: 'Yom HaZikaron',
    hebrew: 'יום הזכרון',
    category: 'holiday',
    subcat: 'modern',
  },
  {
    date: '2026-04-22',
    title: 'Yom HaAtzma’ut',
    hebrew: 'יום העצמאות',
    category: 'holiday',
    subcat: 'modern',
  },
  {
    date: '2026-09-11',
    title: 'Erev Rosh Hashana',
    hebrew: 'ערב ראש השנה',
    category: 'holiday',
    subcat: 'major',
  },
  {
    date: '2026-09-12',
    title: 'Rosh Hashana 5787',
    hebrew: 'ראש השנה 5787',
    category: 'holiday',
    subcat: 'major',
    yomtov: true,
  },
  {
    date: '2026-09-13',
    title: 'Rosh Hashana II',
    hebrew: 'ראש השנה ב׳',
    category: 'holiday',
    subcat: 'major',
    yomtov: true,
  },
  {
    date: '2026-09-20',
    title: 'Erev Yom Kippur',
    hebrew: 'ערב יום כפור',
    category: 'holiday',
    subcat: 'major',
  },
  {
    date: '2026-09-21',
    title: 'Yom Kippur',
    hebrew: 'יום כפור',
    category: 'holiday',
    subcat: 'major',
    yomtov: true,
  },
  {
    date: '2026-09-26',
    title: 'Sukkot I',
    hebrew: 'סוכות א׳',
    category: 'holiday',
    subcat: 'major',
    yomtov: true,
  },
  {
    date: '2026-09-28',
    title: 'Sukkot III (CH’’M)',
    hebrew: 'סוכות ג׳ (חוה״מ)',
    category: 'holiday',
    subcat: 'major',
  },
];

/**
 * A fake fetch that serves both Hebcal endpoints: /hebcal (holidays, filtered
 * by the requested start/end) and /converter (always Kislev 1). Records calls.
 */
export function fakeHebcal(holidays: Array<{ date: string }> = israeliHolidays2026) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/hebcal')) {
      const start = url.searchParams.get('start')!;
      const end = url.searchParams.get('end')!;
      return jsonResponse({ items: holidays.filter((h) => h.date >= start && h.date <= end) });
    }
    return jsonResponse(hebcalKislev1);
  });
}
