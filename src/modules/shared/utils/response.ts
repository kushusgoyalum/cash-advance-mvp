import type { FastifyReply } from 'fastify';
import { HttpStatus } from '../constants/httpStatus.js';

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/** Uniform success envelope: { success: true, data }. */
export const sendSuccess = <T>(reply: FastifyReply, data: T, statusCode: number = HttpStatus.OK): FastifyReply =>
  reply.status(statusCode).send({ success: true, data } satisfies ApiEnvelope<T>);
