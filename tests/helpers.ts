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
