import { logger } from '../config/logger.js';
import { ProviderError } from './retry.js';

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Open when failure rate over the last `windowSize` calls reaches this (and window is full). */
  failureRateThreshold: number;
  windowSize: number;
  /** ...or after this many consecutive timeouts. */
  consecutiveTimeoutsToOpen: number;
  openMs: number;
}

const DEFAULTS: CircuitBreakerOptions = { failureRateThreshold: 0.5, windowSize: 20, consecutiveTimeoutsToOpen: 5, openMs: 60_000 };

/**
 * Circuit breaker around real provider traffic — the AUTHORITY on provider health.
 * The escrow balance probe only feeds hints (`reportProbe`): a failed probe opens the
 * breaker early; a healthy probe moves OPEN → HALF_OPEN early (it never closes it, since
 * the balance API can be up while the payout rail is down).
 * State is per process here; with many pods it can be mirrored in Redis.
 */
export class CircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private window: boolean[] = [];
  private consecutiveTimeouts = 0;
  private openedAt = 0;
  private trialInFlight = false;
  private readonly opts: CircuitBreakerOptions;

  constructor(
    public readonly name: string,
    opts: Partial<CircuitBreakerOptions> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  getState(): BreakerState {
    if (this.state === 'OPEN' && this.now() - this.openedAt >= this.opts.openMs) this.state = 'HALF_OPEN';
    return this.state;
  }

  isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === 'OPEN' || (state === 'HALF_OPEN' && this.trialInFlight)) {
      throw new ProviderError('CIRCUIT_OPEN', `${this.name} circuit is open`);
    }
    if (state === 'HALF_OPEN') this.trialInFlight = true;
    try {
      const result = await fn();
      this.onResult(true, false);
      return result;
    } catch (err) {
      // Only infrastructure-type failures count against provider health, not business rejections.
      const counts = err instanceof ProviderError && err.retryable;
      this.onResult(!counts, err instanceof ProviderError && err.kind === 'TIMEOUT');
      throw err;
    } finally {
      this.trialInFlight = false;
    }
  }

  reportProbe(healthy: boolean): void {
    if (!healthy && this.getState() !== 'OPEN') this.open('probe failed');
    if (healthy && this.getState() === 'OPEN') this.state = 'HALF_OPEN';
  }

  private onResult(success: boolean, timeout: boolean): void {
    if (this.state === 'HALF_OPEN') {
      if (success) this.close();
      else this.open('half-open trial failed');
      return;
    }
    this.consecutiveTimeouts = timeout ? this.consecutiveTimeouts + 1 : 0;
    this.window.push(success);
    if (this.window.length > this.opts.windowSize) this.window.shift();
    const failures = this.window.filter((ok) => !ok).length;
    const windowFull = this.window.length >= this.opts.windowSize;
    if (this.consecutiveTimeouts >= this.opts.consecutiveTimeoutsToOpen) this.open('consecutive timeouts');
    else if (windowFull && failures / this.window.length >= this.opts.failureRateThreshold) this.open('failure rate');
  }

  private open(reason: string): void {
    this.state = 'OPEN';
    this.openedAt = this.now();
    logger.warn({ breaker: this.name, reason }, 'circuit opened');
  }

  private close(): void {
    this.state = 'CLOSED';
    this.window = [];
    this.consecutiveTimeouts = 0;
    logger.info({ breaker: this.name }, 'circuit closed');
  }
}

const breakers = new Map<string, CircuitBreaker>();
export const getBreaker = (name: string): CircuitBreaker => {
  let b = breakers.get(name);
  if (!b) {
    b = new CircuitBreaker(name);
    breakers.set(name, b);
  }
  return b;
};
