/**
 * Modules - Public API aggregator. Importing this file executes every `<module>.routes.ts`
 * (Autowired self-registration), which `registerApiRoutes` then mounts.
 */
export { healthRoutes } from './health/index.js';
export { eligibilityRoutes } from './eligibility/index.js';
export { applicationRoutes } from './application/index.js';
export { reviewRoutes } from './review/index.js';
export { webhooksRoutes } from './webhooks/index.js';
export { jobsRoutes } from './jobs/index.js';
