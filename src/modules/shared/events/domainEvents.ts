/** Every domain event goes through the transactional outbox (never published directly). */
export const DomainEvents = {
  APPLICATION_SUBMITTED: 'APPLICATION_SUBMITTED',
  APPLICATION_APPROVED: 'APPLICATION_APPROVED',
  APPLICATION_REFERRED: 'APPLICATION_REFERRED',
  APPLICATION_REJECTED: 'APPLICATION_REJECTED',
  APPLICATION_CANCELLED: 'APPLICATION_CANCELLED',
  APPLICATION_EXPIRED: 'APPLICATION_EXPIRED',
  DISBURSEMENT_INITIATED: 'DISBURSEMENT_INITIATED',
  ADVANCE_DISBURSED: 'ADVANCE_DISBURSED',
  DISBURSEMENT_FAILED: 'DISBURSEMENT_FAILED',
  COLLECTION_ATTEMPT_PLANNED: 'COLLECTION_ATTEMPT_PLANNED',
  REPAYMENT_SUCCEEDED: 'REPAYMENT_SUCCEEDED',
  REPAYMENT_PARTIAL: 'REPAYMENT_PARTIAL',
  ADVANCE_OVERDUE: 'ADVANCE_OVERDUE',
  REPAYMENT_DUE_REMINDER: 'REPAYMENT_DUE_REMINDER',
  OVERDUE_REMINDER: 'OVERDUE_REMINDER',
  BANK_WEBHOOK_RECEIVED: 'BANK_WEBHOOK_RECEIVED',
} as const;

export type DomainEventType = (typeof DomainEvents)[keyof typeof DomainEvents];

/** Wire format on SQS. `eventId` = outbox row id → consumer-side dedupe key. */
export interface DomainEventMessage<P = Record<string, unknown>> {
  eventId: string;
  type: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: P;
}
