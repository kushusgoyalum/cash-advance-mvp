import { DomainEvents, type DomainEventType } from '@common/index.js';

export type Channel = 'PUSH' | 'SMS' | 'WHATSAPP' | 'EMAIL';

export interface EventTemplate {
  channels: Channel[];
  /** Critical events fall back to WhatsApp if push ultimately fails. */
  critical: boolean;
  /** Reminder/overdue messages are only sent 08:00–19:00 IST. */
  contactWindow: boolean;
  subject: string;
}

/**
 * Event → channels (assumption A16). Template ids are the ids SAVED and WHITELISTED on Karix,
 * resolved by convention: CA_<EVENT>_<CHANNEL> (kept in Karix + config, not in code).
 */
export const EVENT_TEMPLATES: Partial<Record<DomainEventType, EventTemplate>> = {
  [DomainEvents.APPLICATION_SUBMITTED]: { channels: ['PUSH', 'EMAIL'], critical: false, contactWindow: false, subject: 'Application received' },
  [DomainEvents.APPLICATION_APPROVED]: { channels: ['PUSH', 'SMS', 'EMAIL'], critical: true, contactWindow: false, subject: 'Cash advance approved' },
  [DomainEvents.APPLICATION_REJECTED]: { channels: ['PUSH', 'EMAIL'], critical: false, contactWindow: false, subject: 'Application update' },
  [DomainEvents.APPLICATION_EXPIRED]: { channels: ['PUSH'], critical: false, contactWindow: false, subject: 'Application expired' },
  [DomainEvents.ADVANCE_DISBURSED]: { channels: ['PUSH', 'SMS', 'EMAIL'], critical: true, contactWindow: false, subject: 'Funds credited' },
  [DomainEvents.DISBURSEMENT_FAILED]: { channels: ['PUSH', 'SMS'], critical: true, contactWindow: false, subject: 'Funds delayed' },
  [DomainEvents.REPAYMENT_DUE_REMINDER]: { channels: ['PUSH', 'SMS', 'EMAIL'], critical: true, contactWindow: true, subject: 'Repayment reminder' },
  [DomainEvents.REPAYMENT_SUCCEEDED]: { channels: ['PUSH', 'EMAIL'], critical: false, contactWindow: false, subject: 'Repayment successful' },
  [DomainEvents.REPAYMENT_PARTIAL]: { channels: ['PUSH'], critical: false, contactWindow: false, subject: 'Partial repayment received' },
  [DomainEvents.ADVANCE_OVERDUE]: { channels: ['PUSH', 'SMS', 'EMAIL'], critical: true, contactWindow: true, subject: 'Repayment overdue' },
  [DomainEvents.OVERDUE_REMINDER]: { channels: ['PUSH', 'SMS', 'EMAIL'], critical: true, contactWindow: true, subject: 'Repayment overdue' },
};

export const templateIdFor = (event: string, channel: Channel): string => `CA_${event}_${channel}`;
