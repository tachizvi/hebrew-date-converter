import { createServer, type RequestListener, type Server } from 'node:http';

export interface ListenOptions {
  /** The port to try first. */
  port: number;
  /** When true, never move to another port (for deployments that assign the port). */
  strict: boolean;
  /** How many ports to try in total: port, port+1, ... */
  maxAttempts?: number;
  /** Called each time a port is taken and the next one is tried. */
  onPortInUse?: (port: number) => void;
}

/** Listens on exactly one port; resolves once listening, rejects with the socket error. */
function listenOnce(handler: RequestListener, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once('error', reject);
    server.once('listening', () => {
      server.off('error', reject);
      resolve(server);
    });
    server.listen(port);
  });
}

/**
 * Starts the HTTP server on `port`, or - if it is taken and `strict` is off - on
 * the next free port (port+1, port+2, ...), like dev servers such as Vite do.
 * Any other error (e.g. permission denied) is thrown right away.
 */
export async function listenWithFallback(
  handler: RequestListener,
  { port, strict, maxAttempts = 10, onPortInUse }: ListenOptions,
): Promise<{ server: Server; port: number }> {
  for (let attempt = 0; ; attempt++) {
    const candidate = port + attempt;
    try {
      return { server: await listenOnce(handler, candidate), port: candidate };
    } catch (err) {
      const inUse = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
      const canRetry = !strict && attempt + 1 < maxAttempts && candidate < 65535;
      if (!inUse || !canRetry) throw err;
      onPortInUse?.(candidate);
    }
  }
}
