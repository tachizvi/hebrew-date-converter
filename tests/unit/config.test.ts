import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('uses defaults, with port fallback allowed', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.strictPort).toBe(false);
  });

  it('reads STRICT_PORT', () => {
    expect(loadConfig({ STRICT_PORT: 'true' }).strictPort).toBe(true);
  });

  it('fails fast on invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Invalid configuration: PORT/);
    expect(() => loadConfig({ STRICT_PORT: 'yes' })).toThrow(/STRICT_PORT/);
  });
});
