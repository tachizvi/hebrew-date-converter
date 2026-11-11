import { describe, expect, it } from 'vitest';
import { TtlCache } from '../../src/lib/cache.js';

describe('TtlCache', () => {
  it('returns stored values until they expire', () => {
    let now = 1_000;
    const cache = new TtlCache<string>(100, 10, () => now);
    cache.set('a', 'A');
    expect(cache.get('a')).toBe('A');
    now += 99;
    expect(cache.get('a')).toBe('A');
    now += 1;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new TtlCache<number>(1_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // "a" is now more recent than "b"
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});
