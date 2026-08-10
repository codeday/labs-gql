import fetch, { Response } from 'node-fetch';
import { makeDebug } from '../utils/makeDebug';

const DEBUG = makeDebug('attio:client');

const ATTIO_BASE_URL = 'https://api.attio.com';
const MAX_ATTEMPTS = 5;

export class AttioApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly attioType?: string,
    public readonly attioCode?: string,
  ) {
    super(`Attio API error ${status} (${attioType ?? 'unknown'}/${attioCode ?? 'unknown'}): ${JSON.stringify(body)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Tracks call timestamps in a rolling 1-second window and blocks acquire() once
 * maxPerSecond calls have happened in that window. Safe without a mutex because
 * the check-then-push in acquire() runs synchronously (no await) before it returns.
 */
class RateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly maxPerSecond: number) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < 1000);
      if (this.timestamps.length < this.maxPerSecond) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = 1000 - (now - this.timestamps[0]);
      // eslint-disable-next-line no-await-in-loop
      await sleep(Math.max(waitMs, 10));
    }
  }
}

function computeRetryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  if (retryAfterHeader) {
    const asDate = new Date(retryAfterHeader);
    if (!Number.isNaN(asDate.getTime())) {
      return Math.max(0, asDate.getTime() - Date.now());
    }
  }
  const base = (2 ** attempt) * 200;
  const jitter = Math.random() * 200;
  return base + jitter;
}

async function parseBody(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface AttioClient {
  get<T>(path: string): Promise<T>;
  read<T>(path: string, body?: unknown): Promise<T>;
  write<T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown, logContext?: string): Promise<T>;
}

/**
 * fetchImpl is injectable so tests can stub the HTTP layer without a mocking library.
 */
export function createAttioClient(apiToken: string, fetchImpl: typeof fetch = fetch): AttioClient {
  const readLimiter = new RateLimiter(50);
  const writeLimiter = new RateLimiter(20);

  async function request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    limiter: RateLimiter,
    body?: unknown,
    logContext?: string,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await limiter.acquire();

      if (logContext) DEBUG(`${method} ${path} [${logContext}] (attempt ${attempt})`);

      // eslint-disable-next-line no-await-in-loop
      const resp = await fetchImpl(`${ATTIO_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (resp.ok) {
        if (resp.status === 204) return null as unknown as T;
        // eslint-disable-next-line no-await-in-loop
        return (await parseBody(resp)) as T;
      }

      // eslint-disable-next-line no-await-in-loop
      const parsedBody = await parseBody(resp);
      const attioType = (parsedBody as { type?: string } | null)?.type;
      const attioCode = (parsedBody as { code?: string } | null)?.code;

      if (resp.status === 429) {
        if (attempt === MAX_ATTEMPTS) {
          throw new AttioApiError(429, parsedBody, attioType, attioCode);
        }
        const waitMs = computeRetryDelayMs(resp.headers.get('retry-after'), attempt);
        DEBUG(`429 from Attio on ${method} ${path}, retrying in ${Math.round(waitMs)}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(waitMs);
        // eslint-disable-next-line no-continue
        continue;
      }

      throw new AttioApiError(resp.status, parsedBody, attioType, attioCode);
    }
    throw new Error('unreachable');
  }

  return {
    get: <T>(path: string) => request<T>('GET', path, readLimiter),
    read: <T>(path: string, body?: unknown) => request<T>('POST', path, readLimiter, body),
    write: <T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown, logContext?: string) => (
      request<T>(method, path, writeLimiter, body, logContext)
    ),
  };
}
