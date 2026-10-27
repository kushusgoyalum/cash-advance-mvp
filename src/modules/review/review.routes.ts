import { opsAuth } from '@common/index.js';
import { Autowired } from '@routes/autowired.js';
import { ApiModule, ApiPrefix } from '@routes/routes.enum.js';
import { reviewRouteHandlers } from './controllers/index.js';

/** Every admin route: ops token (SSO + MFA) at module level, role check per route. */
export const reviewRoutes = Autowired({ module: ApiModule.REVIEW, prefix: ApiPrefix.ADMIN, preHandler: opsAuth })(reviewRouteHandlers);
