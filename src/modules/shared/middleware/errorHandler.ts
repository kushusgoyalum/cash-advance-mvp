import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../config/logger.js';
import { HttpStatus } from '../constants/httpStatus.js';
import { AppError, ErrorCodes, ErrorMessages } from '../errors/index.js';

/** Maps every error to the common envelope; never leaks internals for unexpected errors. */
export const errorHandler = (error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply): void => {
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  if ('validation' in error && error.validation) {
    void reply.status(HttpStatus.BAD_REQUEST).send({
      success: false,
      error: { code: ErrorCodes.VALIDATION_ERROR, message: ErrorMessages.VALIDATION_ERROR, details: error.validation },
    });
    return;
  }
  logger.error({ err: error, reqId: request.id }, 'unhandled error');
  void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
    success: false,
    error: { code: ErrorCodes.INTERNAL_ERROR, message: ErrorMessages.INTERNAL_ERROR },
  });
};
