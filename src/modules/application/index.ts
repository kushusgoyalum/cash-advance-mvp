/** Application Module - Public API (owns `cash_advance` and the lifecycle state machine). */
export { applicationRoutes } from './application.routes.js';
export {
  decideApplication,
  expireStaleDrafts,
  getAdvanceById,
  getAdvanceByPublicId,
  getStatusHistory,
  lockAdvanceForUpdate,
} from './application.service.js';
export {
  ALLOWED_TRANSITIONS,
  TERMINAL_STATUSES,
  USER_CANCELLABLE,
  MANUALLY_ACTIONABLE,
  REPAYABLE_STATUSES,
  canTransition,
  assertTransition,
  transitionAdvance,
  updateAdvanceInStatus,
} from './stateMachine.js';
export { toAdvanceDto, type AdvanceDto } from './application.mappers.js';
export type { AdvanceStatus, CashAdvance, TransitionInput } from './application.types.js';
