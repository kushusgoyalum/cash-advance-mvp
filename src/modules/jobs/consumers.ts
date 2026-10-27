import { type DomainEventMessage, DomainEvents, logger, QueueName, startConsumer } from '@common/index.js';
import { decideApplication } from '@modules/application/index.js';
import { type CollectMessage, executeAttempt } from '@modules/collection/index.js';
import { startDisbursement } from '@modules/disbursement/index.js';
import { handleDomainEvent } from '@modules/notification/index.js';
import { onApplicationReferred } from '@modules/review/index.js';
import { processInboxEvent, type WebhookMessage } from '@modules/webhooks/index.js';

/** Starts one long-polling consumer per queue. Every handler is idempotent (at-least-once). */
export const startConsumers = (signal: AbortSignal): Array<Promise<void>> => [
  startConsumer<DomainEventMessage>({
    queue: QueueName.DECISION,
    signal,
    handler: async (m) => {
      if (m.type === DomainEvents.APPLICATION_SUBMITTED) await decideApplication(BigInt(m.aggregateId));
      else if (m.type === DomainEvents.APPLICATION_REFERRED) await onApplicationReferred(BigInt(m.aggregateId));
    },
  }),
  startConsumer<DomainEventMessage>({
    queue: QueueName.DISBURSEMENT,
    signal,
    handler: async (m) => {
      if (m.type === DomainEvents.APPLICATION_APPROVED) await startDisbursement(BigInt(m.aggregateId));
    },
  }),
  startConsumer<CollectMessage>({ queue: QueueName.COLLECTION, signal, handler: (m) => executeAttempt(BigInt(m.attemptId)) }),
  startConsumer<DomainEventMessage>({ queue: QueueName.NOTIFICATION, signal, handler: (m) => handleDomainEvent(m) }),
  startConsumer<WebhookMessage>({ queue: QueueName.WEBHOOK, signal, handler: (m) => processInboxEvent(m.inboxId) }),
].map((p) => p.catch((err: unknown) => logger.fatal({ err }, 'consumer crashed')));
