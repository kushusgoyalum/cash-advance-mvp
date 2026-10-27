import { getMongoDBClient } from '@database/index.js';
import { logger, ProviderError } from '@common/index.js';

export interface HttpCallOptions {
  provider: string;
  operation: string;
  baseUrl: string;
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  clientRef?: string;
  timeoutMs?: number;
}

/**
 * Shared JSON-over-HTTPS caller for provider adapters: timeout, error classification
 * (→ ProviderError kinds that drive retry decisions) and a masked API log in Mongo.
 * mTLS / JWE payload encryption plug in here when a provider requires them.
 */
export const httpJson = async <T>(opts: HttpCallOptions): Promise<T> => {
  const started = Date.now();
  let status: number | undefined;
  try {
    const res = await fetch(`${opts.baseUrl}${opts.path}`, {
      method: opts.method,
      headers: { 'content-type': 'application/json', ...opts.headers },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) } : {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    status = res.status;
    if (res.status === 429) throw new ProviderError('RATE_LIMITED', `${opts.provider} rate limited`);
    if (res.status >= 500) throw new ProviderError('SERVER', `${opts.provider} ${res.status}`);
    const json = (await res.json()) as T & { code?: string; message?: string };
    if (res.status >= 400) throw new ProviderError('CLIENT', json.message ?? `${opts.provider} ${res.status}`, json.code);
    return json;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ProviderError('TIMEOUT', `${opts.provider} ${opts.operation} timed out`);
    }
    throw new ProviderError('NETWORK', `${opts.provider} ${opts.operation}: ${String(err)}`);
  } finally {
    void getMongoDBClient()
      .providerApiLog.create({
        data: {
          provider: opts.provider,
          operation: opts.operation,
          clientRef: opts.clientRef ?? null,
          httpStatus: status ?? null,
          latencyMs: Date.now() - started,
        },
      })
      .catch((e: unknown) => logger.debug({ e }, 'provider api log write failed'));
  }
};
