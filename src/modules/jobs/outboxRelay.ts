import { acquireLock, type DomainEventMessage, DomainEvents, type DomainEventType, logger, publishMessage, QueueName } from '@common/index.js';
import * as repo from './jobs.repo.js';

/** Fan-out of each event type to the queues whose consumers care about it. */
export const EVENT_ROUTES: Record<DomainEventType, readonly QueueName[]> = {
  [DomainEvents.APPLICATION_SUBMITTED]: [QueueName.DECISION, QueueName.NOTIFICATION],
  [DomainEvents.APPLICATION_REFERRED]: [QueueName.DECISION],
  [DomainEvents.APPLICATION_APPROVED]: [QueueName.DISBURSEMENT, QueueName.NOTIFICATION],
  [DomainEvents.APPLICATION_REJECTED]: [QueueName.NOTIFICATION],
  [DomainEvents.APPLICATION_CANCELLED]: [QueueName.NOTIFICATION],
  [DomainEvents.APPLICATION_EXPIRED]: [QueueName.NOTIFICATION],
  [DomainEvents.DISBURSEMENT_INITIATED]: [],
  [DomainEvents.ADVANCE_DISBURSED]: [QueueName.NOTIFICATION],
  [DomainEvents.DISBURSEMENT_FAILED]: [QueueName.NOTIFICATION],
  [DomainEvents.COLLECTION_ATTEMPT_PLANNED]: [],
  [DomainEvents.REPAYMENT_SUCCEEDED]: [QueueName.NOTIFICATION],
  [DomainEvents.REPAYMENT_PARTIAL]: [QueueName.NOTIFICATION],
  [DomainEvents.ADVANCE_OVERDUE]: [QueueName.NOTIFICATION],
  [DomainEvents.REPAYMENT_DUE_REMINDER]: [QueueName.NOTIFICATION],
  [DomainEvents.OVERDUE_REMINDER]: [QueueName.NOTIFICATION],
  [DomainEvents.BANK_WEBHOOK_RECEIVED]: [QueueName.WEBHOOK],
};

const MAX_PUBLISH_ATTEMPTS = 20;

/**
 * One relay pass: PENDING outbox rows → SQS → PUBLISHED. A crash between publish and mark
 * re-publishes the event (at-least-once) — every consumer is idempotent, so that is safe.
 */
export const relayOnce = async (limit = 100): Promise<number> => {
  const rows = await repo.fetchPendingOutbox(limit);
  for (const row of rows) {
    const message: DomainEventMessage = {
      eventId: row.id.toString(),
      type: row.eventType as DomainEventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      occurredAt: row.createdAt.toISOString(),
      payload: row.payload as Record<string, unknown>,
    };
    try {
      for (const queue of EVENT_ROUTES[message.type] ?? []) await publishMessage(queue, message);
      await repo.markOutboxPublished(row.id);
    } catch (err) {
      logger.warn({ err, outboxId: row.id.toString() }, 'outbox publish failed');
      await repo.bumpOutboxAttempt(row.id, row.attempts + 1 >= MAX_PUBLISH_ATTEMPTS);
      break; // keep per-aggregate ordering: retry this row first on the next pass
    }
  }
  return rows.length;
};

/** Single active relay (Redis lock) polling every second while there is work. */
export const startOutboxRelay = async (signal: AbortSignal): Promise<void> => {
  while (!signal.aborted) {
    const lock = await acquireLock('outbox-relay', 30_000).catch(() => null);
    if (!lock) {
      await new Promise((r) => setTimeout(r, 5_000));
      continue;
    }
    try {
      const deadline = Date.now() + 25_000;
      while (!signal.aborted && Date.now() < deadline) {
        const n = await relayOnce();
        await new Promise((r) => setTimeout(r, n === 0 ? 1_000 : 50));
      }
    } catch (err) {
      logger.error({ err }, 'outbox relay error');
    } finally {
      await lock.release();
    }
  }
};
