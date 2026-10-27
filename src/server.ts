import { env, logger } from '@common/index.js';
import { disconnectMongoDB, disconnectMySQL, disconnectRedis } from '@database/index.js';
import { buildApp } from './app.js';

/** API process entrypoint. */
const main = async (): Promise<void> => {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down api');
    await app.close();
    await Promise.allSettled([disconnectMySQL(), disconnectMongoDB(), disconnectRedis()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((err: unknown) => {
  logger.fatal({ err }, 'api failed to start');
  process.exit(1);
});
