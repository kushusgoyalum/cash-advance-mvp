import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '../middleware/webhookSignature.js';
import { hmacSha256Hex } from '../utils/hash.js';
import { signHs256Jwt, verifyHs256Jwt } from '../utils/jwt.js';

describe('webhook signature (HMAC + replay window)', () => {
  const secret = 'bank-secret-1234567890';
  const rawBody = '{"eventId":"e1"}';
  const ts = 1_800_000_000;
  const signature = hmacSha256Hex(secret, `${ts}.${rawBody}`);

  it('accepts a valid, fresh signature', () => {
    expect(() => verifyWebhookSignature({ secret, rawBody, signature, timestamp: String(ts), nowSeconds: ts + 10 })).not.toThrow();
  });

  it('rejects a tampered body', () => {
    expect(() => verifyWebhookSignature({ secret, rawBody: '{"eventId":"e2"}', signature, timestamp: String(ts), nowSeconds: ts })).toThrow();
  });

  it('rejects a replay older than 5 minutes', () => {
    expect(() => verifyWebhookSignature({ secret, rawBody, signature, timestamp: String(ts), nowSeconds: ts + 301 })).toThrow();
  });
});

describe('HS256 JWT', () => {
  const secrets = { k1: 'a'.repeat(32) };

  it('round-trips claims', () => {
    const t = signHs256Jwt({ sub: '42' }, secrets.k1, 60);
    expect(verifyHs256Jwt(t, secrets)?.sub).toBe('42');
  });

  it('rejects a token signed with another key or for an unknown kid', () => {
    const t = signHs256Jwt({ sub: '42' }, 'b'.repeat(32), 60);
    expect(verifyHs256Jwt(t, secrets)).toBeNull();
    expect(verifyHs256Jwt(signHs256Jwt({ sub: '42' }, secrets.k1, 60, 'k9'), secrets)).toBeNull();
  });

  it('rejects an expired token', () => {
    expect(verifyHs256Jwt(signHs256Jwt({ sub: '42' }, secrets.k1, -1), secrets)).toBeNull();
  });
});
