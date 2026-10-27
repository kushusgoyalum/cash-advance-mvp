/** Eligibility Module - Public API */
export { eligibilityRoutes } from './eligibility.routes.js';
export {
  getEligibility,
  getValidSnapshot,
  recheckHardGates,
  evaluateForDecision,
  invalidateEligibilityCache,
} from './eligibility.service.js';
export { getActiveProductConfig, findTier, DEFAULT_PRODUCT_CONFIG, type ProductConfigView, type TierConfig } from './product/productConfig.service.js';
export type { DecisionResult, Decision, EligibilityView } from './eligibility.types.js';
