/** All amounts are integer paise held as bigint — no floating point anywhere in the money path. */
export const minPaise = (a: bigint, b: bigint): bigint => (a < b ? a : b);
export const maxPaise = (a: bigint, b: bigint): bigint => (a > b ? a : b);
export const ZERO = 0n;

/** Safe for API payloads: max advance is far below Number.MAX_SAFE_INTEGER paise. */
export const paiseToNumber = (p: bigint): number => Number(p);

/** APR in basis points for a flat fee: fee/principal * 365/tenure. */
export const flatFeeAprBps = (feePaise: bigint, principalPaise: bigint, tenureDays: number): number =>
  principalPaise === 0n ? 0 : Math.round((Number(feePaise) / Number(principalPaise)) * (365 / tenureDays) * 10_000);
