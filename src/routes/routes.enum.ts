/** Central module identities + prefixes (avoids string drift across route files). */
export enum ApiModule {
  HEALTH = 'health',
  ELIGIBILITY = 'eligibility',
  APPLICATION = 'application',
  REVIEW = 'review',
  JOBS = 'jobs',
  WEBHOOKS = 'webhooks',
}

export enum ApiPrefix {
  HEALTH = '/health',
  /** Mobile app (user JWT). */
  USER = '/v1/cash-advance',
  /** Admin portal (ops SSO token + RBAC). */
  ADMIN = '/admin/v1/cash-advance',
  /** Scheduler / internal callers (service token). */
  INTERNAL = '/internal/v1/cash-advance',
  /** Provider callbacks (HMAC signature). */
  WEBHOOKS = '/webhooks/v1',
}
