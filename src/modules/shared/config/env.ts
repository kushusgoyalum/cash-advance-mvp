import { config } from 'dotenv';
import { z } from 'zod';

config();

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.string().default('info'),
  MYSQL_DATABASE_URL: z.string().min(1),
  MONGODB_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AWS_REGION: z.string().default('ap-south-1'),
  SQS_ENDPOINT: z.string().optional(),
  SQS_QUEUE_URL_PREFIX: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(32),
  OPS_JWT_SECRET: z.string().min(32),
  INTERNAL_API_TOKEN: z.string().min(16),
  BANK_WEBHOOK_SECRET: z.string().min(16),
  BANK_BASE_URL: z.string().min(1),
  BANK_API_KEY: z.string().min(1),
  BANK_ESCROW_ACCOUNT_ID: z.string().min(1),
  BANK_COLLECTION_ACCOUNT_ID: z.string().min(1),
  BANK_PROVIDER_TPS: z.coerce.number().int().positive().default(20),
  KARIX_BASE_URL: z.string().min(1),
  KARIX_API_KEY: z.string().min(1),
  KARIX_SENDER_ID: z.string().min(1),
  BUREAU_BASE_URL: z.string().min(1),
  PLATFORM_BASE_URL: z.string().min(1),
  USE_MOCK_PROVIDERS: bool,
  LENDER_CODE: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

/** Validated once at boot — the process refuses to start on a bad config. */
export const env: Env = envSchema.parse(process.env);

export const isProduction = (): boolean => env.NODE_ENV === 'production';
