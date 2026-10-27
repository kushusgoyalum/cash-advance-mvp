import { hmacSha256Hex, safeEqual } from './hash.js';

/**
 * Minimal HS256 (HMAC-SHA-256) JWT sign/verify. The signing secret (256-bit, from Secrets
 * Manager) plays the role a salt would; `kid` lets us rotate secrets without logging users out.
 * Tokens are signed, NOT encrypted — never put PII in claims.
 */
const b64url = (buf: Buffer): string => buf.toString('base64url');
const sign = (secret: string, data: string): string => Buffer.from(hmacSha256Hex(secret, data), 'hex').toString('base64url');

export interface JwtClaims {
  sub: string;
  iat?: number;
  exp?: number;
  [claim: string]: unknown;
}

export const signHs256Jwt = (claims: JwtClaims, secret: string, ttlSeconds: number, kid = 'k1'): string => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid })));
  const payload = b64url(Buffer.from(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds })));
  return `${header}.${payload}.${sign(secret, `${header}.${payload}`)}`;
};

/** Returns the claims or null — callers map null to 401 (no detail leaked). */
export const verifyHs256Jwt = <T extends JwtClaims>(token: string, secrets: Record<string, string>): T | null => {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  let kid: string | undefined;
  let alg: string | undefined;
  try {
    ({ kid, alg } = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { kid?: string; alg?: string });
  } catch {
    return null;
  }
  const secret = kid ? secrets[kid] : undefined;
  if (alg !== 'HS256' || !secret || !safeEqual(sign(secret, `${header}.${payload}`), signature)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
};
