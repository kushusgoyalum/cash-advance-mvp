import { env, verifyHs256Jwt } from '@common/index.js';

/**
 * Step-up check at submit: the identity service issues a short-lived token after a fresh OTP /
 * MPIN, with `purpose = CASH_ADVANCE_SUBMIT` and `sub = userId`.
 */
export const isValidStepUpToken = (token: string | undefined, userId: bigint): boolean => {
  if (!token) return false;
  const claims = verifyHs256Jwt<{ sub: string; purpose?: string }>(token, { k1: env.AUTH_JWT_SECRET });
  return claims?.sub === userId.toString() && claims.purpose === 'CASH_ADVANCE_SUBMIT';
};

export const kfsUrlFor = (publicId: string): string => `/v1/cash-advance/applications/${publicId}/kfs`;
