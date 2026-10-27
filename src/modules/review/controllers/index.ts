import {
  approveApplicationController,
  getApplicationDetailsController,
  getAuditHistoryController,
  killSwitchController,
  listRepaymentsController,
  rejectApplicationController,
  retryDisbursementController,
  searchApplicationsController,
} from './admin.controllers.js';

export const reviewRouteHandlers = [
  searchApplicationsController,
  getApplicationDetailsController,
  approveApplicationController,
  rejectApplicationController,
  retryDisbursementController,
  getAuditHistoryController,
  listRepaymentsController,
  killSwitchController,
];
