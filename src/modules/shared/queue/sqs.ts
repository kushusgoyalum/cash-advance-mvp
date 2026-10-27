import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { backoffWithJitterMs } from '../resilience/retry.js';
import { type QueueName, queueUrl } from './queues.js';

let client: SQSClient | undefined;
const sqs = (): SQSClient => {
  client ??= new SQSClient({ region: env.AWS_REGION, ...(env.SQS_ENDPOINT ? { endpoint: env.SQS_ENDPOINT } : {}) });
  return client;
};

export const publishMessage = async (queue: QueueName, body: unknown, options: { delaySeconds?: number } = {}): Promise<void> => {
  await sqs().send(
    new SendMessageCommand({
      QueueUrl: queueUrl(queue),
      MessageBody: JSON.stringify(body),
      ...(options.delaySeconds ? { DelaySeconds: Math.min(900, Math.floor(options.delaySeconds)) } : {}),
    }),
  );
};

export interface ConsumerOptions<T> {
  queue: QueueName;
  handler: (message: T) => Promise<void>;
  signal: AbortSignal;
  batchSize?: number;
}

/**
 * Long-polling consumer. Delivery is AT-LEAST-ONCE, so every handler must be idempotent.
 * On failure the message is NOT deleted: its visibility is extended with backoff, and after
 * maxReceiveCount the queue's redrive policy moves it to the DLQ (alarmed).
 */
export const startConsumer = async <T>(options: ConsumerOptions<T>): Promise<void> => {
  const url = queueUrl(options.queue);
  const log = logger.child({ queue: options.queue });
  while (!options.signal.aborted) {
    try {
      const { Messages = [] } = await sqs().send(
        new ReceiveMessageCommand({
          QueueUrl: url,
          MaxNumberOfMessages: options.batchSize ?? 10,
          WaitTimeSeconds: 20,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        }),
      );
      await Promise.all(
        Messages.map(async (m) => {
          try {
            await options.handler(JSON.parse(m.Body ?? '{}') as T);
            await sqs().send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: m.ReceiptHandle }));
          } catch (err) {
            const receiveCount = Number(m.Attributes?.ApproximateReceiveCount ?? '1');
            log.warn({ err, messageId: m.MessageId, receiveCount }, 'handler failed; will be redelivered');
            await sqs().send(
              new ChangeMessageVisibilityCommand({
                QueueUrl: url,
                ReceiptHandle: m.ReceiptHandle,
                VisibilityTimeout: Math.ceil(backoffWithJitterMs(receiveCount, { baseMs: 5_000, capMs: 900_000 }) / 1000),
              }),
            );
          }
        }),
      );
    } catch (err) {
      log.error({ err }, 'receive failed');
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
};
