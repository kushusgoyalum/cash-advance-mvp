import { userJwtAuth } from '@common/index.js';
import { Autowired } from '@routes/autowired.js';
import { ApiModule, ApiPrefix } from '@routes/routes.enum.js';
import { applicationRouteHandlers } from './controllers/index.js';

export const applicationRoutes = Autowired({ module: ApiModule.APPLICATION, prefix: ApiPrefix.USER, preHandler: userJwtAuth })(
  applicationRouteHandlers,
);
