import { env } from '../config/env.js';

/** One queue (+ DLQ, maxReceiveCount=5) per workload so a backlog in one never starves another. */
export const QueueName = {
  DECISION: 'decision',
  DISBURSEMENT: 'disbursement',
  COLLECTION: 'collection',
  NOTIFICATION: 'notification',
  WEBHOOK: 'webhook',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const queueUrl = (queue: QueueName): string => `${env.SQS_QUEUE_URL_PREFIX}${queue}`;
