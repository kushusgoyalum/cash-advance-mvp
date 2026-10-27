import type { ActorType } from '@prisma/mysql-client';

export interface Actor {
  type: ActorType;
  id: string;
}

export interface AuditEntryInput {
  entityType: string;
  entityId: string;
  action: string;
  actor: Actor;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  reason?: string | undefined;
  ip?: string | undefined;
  requestId?: string | undefined;
}
