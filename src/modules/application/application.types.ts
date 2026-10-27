import type { AdvanceStatus, CashAdvance, Prisma } from '@prisma/mysql-client';
import type { DomainEventType } from '@common/index.js';
import type { Actor } from '@modules/audit/index.js';

export type { AdvanceStatus, CashAdvance };

export interface TransitionInput {
  advanceId: bigint;
  from: AdvanceStatus;
  to: AdvanceStatus;
  actor: Actor;
  /** Admin actions pass the version they saw (optimistic concurrency → 409 VERSION_CONFLICT). */
  expectedVersion?: number | undefined;
  reason?: string | undefined;
  requestId?: string | undefined;
  /** Extra columns updated atomically with the status (amounts, due date, decision fields...). */
  data?: Prisma.CashAdvanceUpdateManyMutationInput;
  event?: { type: DomainEventType; payload?: Record<string, unknown> } | undefined;
}

export interface Consents {
  kfsAccepted: boolean;
  bureauPullConsent: boolean;
  debitAuthorization: boolean;
}

export interface Quote {
  principalPaise: bigint;
  feePaise: bigint;
  totalRepayablePaise: bigint;
  aprBps: number;
  indicativeDueDate: string;
}
