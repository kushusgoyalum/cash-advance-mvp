import { cancelApplicationController } from './cancelApplication.controller.js';
import { createApplicationController } from './createApplication.controller.js';
import { getApplicationController } from './getApplication.controller.js';
import { listApplicationsController } from './listApplications.controller.js';
import { submitApplicationController } from './submitApplication.controller.js';

export const applicationRouteHandlers = [
  createApplicationController,
  submitApplicationController,
  getApplicationController,
  listApplicationsController,
  cancelApplicationController,
];
