import { logger } from '@common/index.js';
import { disconnectMongoDB, disconnectMySQL, disconnectRedis } from '@database/index.js';
import { startConsumers, startOutboxRelay, startScheduler } from '@modules/jobs/index.js';

/**
 * Worker process entrypoint (same codebase, separate deployment): SQS consumers, the outbox
 * relay and the scheduler. Scales independently of the API (autoscale on queue depth).
 */
const main = async (): Promise<void> => {
  const controller = new AbortController();
  const tasks = [...startConsumers(controller.signal), startOutboxRelay(controller.signal), startScheduler(controller.signal)];
  logger.info('worker started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down worker (finishing in-flight messages)');
    controller.abort();
    await Promise.race([Promise.allSettled(tasks), new Promise((r) => setTimeout(r, 25_000))]);
    await Promise.allSettled([disconnectMySQL(), disconnectMongoDB(), disconnectRedis()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((err: unknown) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
