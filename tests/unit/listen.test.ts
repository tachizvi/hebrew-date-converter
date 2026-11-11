import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { listenWithFallback } from '../../src/lib/listen.js';

const handler = () => {};
const open: Server[] = [];

/** Occupies a free port chosen by the OS and returns it. */
async function occupyPort(): Promise<number> {
  const blocker = createServer();
  open.push(blocker);
  await new Promise<void>((resolve) => blocker.listen(0, resolve));
  return (blocker.address() as AddressInfo).port;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('listenWithFallback', () => {
  it('uses the requested port when it is free', async () => {
    const port = await occupyPort();
    await new Promise((r) => open.pop()!.close(r)); // free it again
    const started = await listenWithFallback(handler, { port, strict: false });
    open.push(started.server);
    expect(started.port).toBe(port);
  });

  it('moves to the next port when the requested one is taken', async () => {
    const taken = await occupyPort();
    const skipped: number[] = [];
    const started = await listenWithFallback(handler, {
      port: taken,
      strict: false,
      onPortInUse: (p) => skipped.push(p),
    });
    open.push(started.server);
    expect(started.port).toBeGreaterThan(taken);
    expect(skipped[0]).toBe(taken);
  });

  it('fails with EADDRINUSE in strict mode', async () => {
    const taken = await occupyPort();
    await expect(listenWithFallback(handler, { port: taken, strict: true })).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
  });

  it('gives up after maxAttempts', async () => {
    const taken = await occupyPort();
    await expect(
      listenWithFallback(handler, { port: taken, strict: false, maxAttempts: 1 }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
