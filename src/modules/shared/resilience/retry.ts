/** Classified provider failure — decides retry vs. terminal handling (design §4.2). */
export type ProviderErrorKind = 'TIMEOUT' | 'NETWORK' | 'RATE_LIMITED' | 'SERVER' | 'CIRCUIT_OPEN' | 'CLIENT' | 'BUSINESS';

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly providerCode?: string,
  ) {
    super(message);
  }

  /** Timeouts/5xx/429/network/open-circuit are transient; 4xx and business errors are not. */
  get retryable(): boolean {
    return ['TIMEOUT', 'NETWORK', 'RATE_LIMITED', 'SERVER', 'CIRCUIT_OPEN'].includes(this.kind);
  }

  /** For these the request MAY have reached the provider → outcome unknown → query status. */
  get outcomeUnknown(): boolean {
    return this.kind === 'TIMEOUT' || this.kind === 'NETWORK' || this.kind === 'SERVER';
  }
}

/** Exponential backoff with full jitter: random(0, min(cap, base * 2^attempt)). */
export const backoffWithJitterMs = (
  attempt: number,
  { baseMs, capMs }: { baseMs: number; capMs: number },
  random: () => number = Math.random,
): number => Math.floor(random() * Math.min(capMs, baseMs * 2 ** Math.max(0, attempt)));

/** Payout schedule 30s → 1m → 2m → 5m → 15m → 30m → 1h (cap), with ±20% jitter. */
const PAYOUT_SCHEDULE_MS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];
export const payoutRetryDelayMs = (retryCount: number, random: () => number = Math.random): number => {
  const base = PAYOUT_SCHEDULE_MS[Math.min(retryCount, PAYOUT_SCHEDULE_MS.length - 1)] ?? 3_600_000;
  return Math.round(base * (0.8 + random() * 0.4));
};

/** In-process retry for short, idempotent calls (e.g. bureau pull: 1s, 4s, 10s). */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  delaysMs: readonly number[],
  isRetryable: (err: unknown) => boolean = (e) => e instanceof ProviderError && e.retryable,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const delay = delaysMs[attempt];
      if (delay === undefined || !isRetryable(err)) throw err;
      await sleep(delay);
    }
  }
};
