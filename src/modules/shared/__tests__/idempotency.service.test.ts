import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../idempotency/idempotency.repo.js', () => ({
  tryClaimKey: vi.fn(),
  findKey: vi.fn(),
  completeKey: vi.fn(),
  releaseKey: vi.fn(),
}));

const repo = await import('../idempotency/idempotency.repo.js');
const { withIdempotency } = await import('../idempotency/idempotency.service.js');

const KEY = '6f1c2a9e-1111-4222-8333-944455556666';
const ctx = { userId: '7', key: KEY, endpoint: 'POST /applications', body: { amount: 300000 } };

describe('withIdempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a well-formed Idempotency-Key', async () => {
    await expect(withIdempotency({ ...ctx, key: undefined }, vi.fn())).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_MISSING' });
  });

  it('first request runs the handler once and stores the response', async () => {
    vi.mocked(repo.tryClaimKey).mockResolvedValue(true);
    const handler = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 'ca_1' } });

    const r = await withIdempotency(ctx, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(repo.completeKey).toHaveBeenCalledWith('7', KEY, 201, { id: 'ca_1' });
    expect(r).toEqual({ statusCode: 201, body: { id: 'ca_1' }, replayed: false });
  });

  it('a retry with the same key and body replays the stored response without side effects', async () => {
    vi.mocked(repo.tryClaimKey).mockResolvedValueOnce(true);
    await withIdempotency(ctx, vi.fn().mockResolvedValue({ statusCode: 201, body: {} }));
    const hash = vi.mocked(repo.tryClaimKey).mock.calls[0]?.[0].requestHash;

    vi.mocked(repo.tryClaimKey).mockResolvedValueOnce(false);
    vi.mocked(repo.findKey).mockResolvedValue({ requestHash: hash, status: 'DONE', responseCode: 201, responseBody: { id: 'ca_1' } } as never);
    const handler = vi.fn();

    const r = await withIdempotency(ctx, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(r).toEqual({ statusCode: 201, body: { id: 'ca_1' }, replayed: true });
  });

  it('same key with a different body → 422 IDEMPOTENCY_KEY_MISMATCH', async () => {
    vi.mocked(repo.tryClaimKey).mockResolvedValue(false);
    vi.mocked(repo.findKey).mockResolvedValue({ requestHash: 'other', status: 'DONE' } as never);
    await expect(withIdempotency(ctx, vi.fn())).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_MISMATCH', statusCode: 422 });
  });

  it('same key still in progress → 409 REQUEST_IN_PROGRESS', async () => {
    vi.mocked(repo.tryClaimKey).mockResolvedValueOnce(true);
    await withIdempotency(ctx, vi.fn().mockResolvedValue({ statusCode: 201, body: {} }));
    const hash = vi.mocked(repo.tryClaimKey).mock.calls[0]?.[0].requestHash;
    vi.mocked(repo.tryClaimKey).mockResolvedValueOnce(false);
    vi.mocked(repo.findKey).mockResolvedValue({ requestHash: hash, status: 'IN_PROGRESS' } as never);
    await expect(withIdempotency(ctx, vi.fn())).rejects.toMatchObject({ code: 'REQUEST_IN_PROGRESS', statusCode: 409 });
  });

  it('releases the key when the handler fails so the client can retry', async () => {
    vi.mocked(repo.tryClaimKey).mockResolvedValue(true);
    await expect(withIdempotency(ctx, vi.fn().mockRejectedValue(new Error('boom')))).rejects.toThrow('boom');
    expect(repo.releaseKey).toHaveBeenCalledWith('7', KEY);
    expect(repo.completeKey).not.toHaveBeenCalled();
  });
});
