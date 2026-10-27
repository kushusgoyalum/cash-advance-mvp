import { getMySQLClient } from '@database/index.js';
import { env, logger } from '@common/index.js';

export interface TierConfig {
  tier: string;
  capPaise: bigint;
  feePaise: bigint;
}

export interface ProductConfigView {
  version: number;
  lenderCode: string;
  tiers: TierConfig[];
  tenureOptionsDays: number[];
  minAmountPaise: bigint;
  maxAmountPaise: bigint;
}

/** Illustrative defaults (assumption A8/A9) used until a row exists in product_config. */
export const DEFAULT_PRODUCT_CONFIG: ProductConfigView = {
  version: 1,
  lenderCode: env.LENDER_CODE,
  tiers: [
    { tier: 'STARTER', capPaise: 2_000_00n, feePaise: 49_00n },
    { tier: 'T1', capPaise: 5_000_00n, feePaise: 99_00n },
    { tier: 'T2', capPaise: 10_000_00n, feePaise: 199_00n },
    { tier: 'T3', capPaise: 25_000_00n, feePaise: 399_00n },
  ],
  tenureOptionsDays: [7, 15, 30],
  minAmountPaise: 500_00n,
  maxAmountPaise: 25_000_00n,
};

let cached: { value: ProductConfigView; at: number } | undefined;

/** Versioned config: advances store the version they were priced with (immutable rows). */
export const getActiveProductConfig = async (): Promise<ProductConfigView> => {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  try {
    const row = await getMySQLClient().productConfig.findFirst({
      where: { isActive: true, effectiveFrom: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });
    const value: ProductConfigView = row
      ? {
          version: row.version,
          lenderCode: row.lenderCode,
          tiers: (row.tiers as Array<{ tier: string; capPaise: string; feePaise: string }>).map((t) => ({
            tier: t.tier,
            capPaise: BigInt(t.capPaise),
            feePaise: BigInt(t.feePaise),
          })),
          tenureOptionsDays: row.tenureOptions as number[],
          minAmountPaise: row.minAmountPaise,
          maxAmountPaise: row.maxAmountPaise,
        }
      : DEFAULT_PRODUCT_CONFIG;
    cached = { value, at: Date.now() };
    return value;
  } catch (err) {
    logger.warn({ err }, 'product config read failed, using default');
    return DEFAULT_PRODUCT_CONFIG;
  }
};

export const findTier = (config: ProductConfigView, tier: string): TierConfig | undefined =>
  config.tiers.find((t) => t.tier === tier);
