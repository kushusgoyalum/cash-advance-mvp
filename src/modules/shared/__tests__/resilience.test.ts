import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../resilience/circuitBreaker.js';
import { backoffWithJitterMs, payoutRetryDelayMs, ProviderError, withRetry } from '../resilience/retry.js';

const timeout = () => Promise.reject(new ProviderError('TIMEOUT', 't'));
const server = () => Promise.reject(new ProviderError('SERVER', '500'));

describe('CircuitBreaker', () => {
  it('opens after 5 consecutive timeouts and fails fast while open', async () => {
    const b = new CircuitBreaker('bank', { windowSize: 100 });
    for (let i = 0; i < 5; i += 1) await expect(b.exec(timeout)).rejects.toThrow();
    expect(b.getState()).toBe('OPEN');
    const fn = vi.fn();
    await expect(b.exec(fn)).rejects.toMatchObject({ kind: 'CIRCUIT_OPEN' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('opens on ≥50% failure rate over a full window', async () => {
    const b = new CircuitBreaker('bank', { windowSize: 4, consecutiveTimeoutsToOpen: 99 });
    await b.exec(() => Promise.resolve(1));
    await b.exec(() => Promise.resolve(1));
    await expect(b.exec(server)).rejects.toThrow();
    await expect(b.exec(server)).rejects.toThrow();
    expect(b.getState()).toBe('OPEN');
  });

  it('business (non-retryable) errors do not count against provider health', async () => {
    const b = new CircuitBreaker('bank', { windowSize: 2, consecutiveTimeoutsToOpen: 99 });
    const biz = () => Promise.reject(new ProviderError('BUSINESS', 'insufficient funds'));
    await expect(b.exec(biz)).rejects.toThrow();
    await expect(b.exec(biz)).rejects.toThrow();
    expect(b.getState()).toBe('CLOSED');
  });

  it('half-opens after openMs and closes on a successful trial', async () => {
    let now = 0;
    const b = new CircuitBreaker('bank', { openMs: 1_000, windowSize: 100 }, () => now);
    for (let i = 0; i < 5; i += 1) await expect(b.exec(timeout)).rejects.toThrow();
    now = 1_001;
    expect(b.getState()).toBe('HALF_OPEN');
    await b.exec(() => Promise.resolve('ok'));
    expect(b.getState()).toBe('CLOSED');
  });

  it('a healthy escrow-balance probe only half-opens (never closes) the breaker', async () => {
    const b = new CircuitBreaker('bank', { openMs: 60_000, windowSize: 100 }, () => 0);
    for (let i = 0; i < 5; i += 1) await expect(b.exec(timeout)).rejects.toThrow();
    b.reportProbe(true);
    expect(b.getState()).toBe('HALF_OPEN');
  });

  it('a failed probe opens the breaker early', () => {
    const b = new CircuitBreaker('bank');
    b.reportProbe(false);
    expect(b.getState()).toBe('OPEN');
  });
});

describe('retry policy', () => {
  it('full-jitter backoff is bounded by the cap', () => {
    expect(backoffWithJitterMs(20, { baseMs: 1_000, capMs: 60_000 }, () => 0.999)).toBeLessThan(60_000);
    expect(backoffWithJitterMs(0, { baseMs: 1_000, capMs: 60_000 }, () => 0.5)).toBe(500);
  });

  it('payout schedule grows 30s → 1h (cap) with ±20% jitter', () => {
    expect(payoutRetryDelayMs(0, () => 0.5)).toBe(30_000);
    expect(payoutRetryDelayMs(6, () => 0.5)).toBe(3_600_000);
    expect(payoutRetryDelayMs(50, () => 0.5)).toBe(3_600_000);
  });

  it('withRetry retries transient errors only', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValueOnce(new ProviderError('TIMEOUT', 't')).mockResolvedValue('ok');
    await expect(withRetry(fn, [1, 4, 10], undefined, sleep)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);

    const clientErr = vi.fn().mockRejectedValue(new ProviderError('CLIENT', 'bad request'));
    await expect(withRetry(clientErr, [1, 4, 10], undefined, sleep)).rejects.toMatchObject({ kind: 'CLIENT' });
    expect(clientErr).toHaveBeenCalledTimes(1);
  });
});
