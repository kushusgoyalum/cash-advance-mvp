import { internalAuth } from '@common/index.js';
import { Autowired } from '@routes/autowired.js';
import { ApiModule, ApiPrefix } from '@routes/routes.enum.js';
import { runJobController } from './controllers/runJob.controller.js';

export const jobsRoutes = Autowired({ module: ApiModule.JOBS, prefix: ApiPrefix.INTERNAL, preHandler: internalAuth })([runJobController]);
