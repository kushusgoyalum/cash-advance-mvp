import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { HttpStatus } from '../constants/httpStatus.js';
import { AppError, ErrorCodes } from '../errors/index.js';
import { type JwtClaims, verifyHs256Jwt } from '../utils/jwt.js';

interface UserClaims extends JwtClaims {
  sid?: string;
}

/**
 * Verifies the access JWT issued by the platform identity service (mobile OTP login).
 * The user id ALWAYS comes from the token, never from the body/params (prevents IDOR).
 */
export const userJwtAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(ErrorCodes.AUTH_MISSING_TOKEN, HttpStatus.UNAUTHORIZED);
  const claims = verifyHs256Jwt<UserClaims>(header.slice(7), { k1: env.AUTH_JWT_SECRET });
  if (!claims || !/^\d+$/.test(claims.sub)) throw new AppError(ErrorCodes.AUTH_INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
  request.user = { userId: BigInt(claims.sub), sessionId: claims.sid };
};

export const requireUser = (request: FastifyRequest): NonNullable<FastifyRequest['user']> => {
  if (!request.user) throw new AppError(ErrorCodes.AUTH_MISSING_TOKEN, HttpStatus.UNAUTHORIZED);
  return request.user;
};
