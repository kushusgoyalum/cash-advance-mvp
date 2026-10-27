import { getMySQLClient } from '@database/index.js';
import { canonicalJson } from '../utils/hash.js';
import type { DomainEventType } from '../events/domainEvents.js';

export interface EmitEventInput {
  type: DomainEventType;
  aggregateType: 'cash_advance' | 'webhook';
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Writes the event to `outbox_event` using the CURRENT transaction (if any). Because the
 * state change and the event commit together, we can never change state without emitting
 * the event or emit an event for a change that rolled back (no dual-write problem).
 */
export const emitEvent = async (input: EmitEventInput): Promise<void> => {
  await getMySQLClient().outboxEvent.create({
    data: {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.type,
      payload: JSON.parse(canonicalJson(input.payload)) as object,
    },
  });
};
