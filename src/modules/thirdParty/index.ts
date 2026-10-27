/**
 * Third-party Module - Public API. Domain modules depend on PORTS (interfaces) obtained from
 * registries — never on a concrete vendor adapter.
 */
export type {
  BankingProvider,
  PayoutRequest,
  PayoutResult,
  DebitRequest,
  DebitResult,
  DebitFailureCode,
  StatementEntry,
  ProviderTxnStatus,
} from './banking/banking.port.js';
export { getBankingProvider, isBankAvailable, probeBankHealth, BANK_BREAKER } from './banking/banking.registry.js';
export type { BureauProvider, BureauSummary } from './bureau/bureau.port.js';
export { getBureauProvider } from './bureau/bureau.registry.js';
export type { MessagingProvider, PushProvider, TemplateMessage, SendResult } from './notification/notification.port.js';
export { getMessagingProvider, getPushProvider } from './notification/notification.registry.js';
export type { PlatformClient, UserProfile, UserContact } from './platform/platform.port.js';
export { getPlatformClient } from './platform/platform.registry.js';
