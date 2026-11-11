import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../../src/lib/concurrency.js';

describe('mapWithConcurrency', () => {
  it('keeps input order and never exceeds the limit', async () => {
    let running = 0;
    let maxRunning = 0;
    const result = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 10;
    });
    expect(result).toEqual([50, 10, 40, 20, 30, 0, 60]);
    expect(maxRunning).toBe(3);
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
