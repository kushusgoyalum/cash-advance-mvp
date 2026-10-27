import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { HttpStatus } from '../constants/httpStatus.js';
import { AppError, ErrorCodes } from '../errors/index.js';
import { safeEqual } from '../utils/hash.js';

/** Scheduler / internal callers (EventBridge → internal route) present a service token. */
export const internalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
  const token = request.headers['x-internal-token'];
  if (typeof token !== 'string' || !safeEqual(token, env.INTERNAL_API_TOKEN)) {
    throw new AppError(ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN);
  }
};
