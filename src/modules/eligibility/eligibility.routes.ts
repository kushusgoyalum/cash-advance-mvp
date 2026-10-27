import { userJwtAuth } from '@common/index.js';
import { Autowired } from '@routes/autowired.js';
import { ApiModule, ApiPrefix } from '@routes/routes.enum.js';
import { eligibilityRouteHandlers } from './controllers/index.js';

export const eligibilityRoutes = Autowired({ module: ApiModule.ELIGIBILITY, prefix: ApiPrefix.USER, preHandler: userJwtAuth })(
  eligibilityRouteHandlers,
);
