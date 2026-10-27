/** Logger redact paths — raw PII must never be written to logs. */
export const PII_REDACT_PATHS = [
  'req.headers.authorization',
  '*.pan',
  '*.accountNumber',
  '*.mobile',
  '*.email',
  '*.aadhaar',
  '*.otp',
];

export const maskMobile = (mobile: string): string =>
  mobile.length <= 4 ? '****' : `${'*'.repeat(mobile.length - 4)}${mobile.slice(-4)}`;

export const maskAccountNumber = (acct: string): string =>
  acct.length <= 4 ? '****' : `XXXX${acct.slice(-4)}`;
