import { type ErrorCode, ErrorMessages } from './errorCodes.js';

export interface ErrorDetails {
  [key: string]: unknown;
}

/** Expected (operational) business failure — mapped to an HTTP envelope by errorHandler. */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, statusCode: number, details?: ErrorDetails, message?: string) {
    super(message ?? ErrorMessages[code]);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
