import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { env } from '../config/env.js';
import { HttpStatus } from '../constants/httpStatus.js';
import { AppError, ErrorCodes } from '../errors/index.js';
import { type JwtClaims, verifyHs256Jwt } from '../utils/jwt.js';
import { OPS_ROLES, type OpsPrincipal, type OpsRole, roleAtLeast } from './principals.js';

interface OpsClaims extends JwtClaims {
  role?: string;
  approvalLimitPaise?: string;
}

/**
 * Ops users sign in through company SSO (OIDC + MFA); the admin gateway exchanges the IdP
 * token for this short-lived service token carrying the role. Applied to every admin route.
 */
export const opsAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(ErrorCodes.AUTH_MISSING_TOKEN, HttpStatus.UNAUTHORIZED);
  const claims = verifyHs256Jwt<OpsClaims>(header.slice(7), { k1: env.OPS_JWT_SECRET });
  const role = claims?.role as OpsRole | undefined;
  if (!claims || !role || !OPS_ROLES.includes(role)) throw new AppError(ErrorCodes.AUTH_INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
  request.ops = { opsUserId: claims.sub, role, approvalLimitPaise: BigInt(claims.approvalLimitPaise ?? '0') };
};

/** Per-route RBAC guard, e.g. `preHandler: requireOpsRole('REVIEWER')`. */
export const requireOpsRole =
  (required: OpsRole): preHandlerAsyncHookHandler =>
  async (request) => {
    if (!request.ops || !roleAtLeast(request.ops.role, required)) {
      throw new AppError(ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN, { required });
    }
  };

export const requireOps = (request: FastifyRequest): OpsPrincipal => {
  if (!request.ops) throw new AppError(ErrorCodes.AUTH_MISSING_TOKEN, HttpStatus.UNAUTHORIZED);
  return request.ops;
};
