import type { FastifyInstance } from 'fastify';
import { getRouteRegistrations } from './autowired.js';

/** Importing '@modules/index.js' executes every `<module>.routes.ts` → registry is populated. */
export const registerApiRoutes = async (app: FastifyInstance): Promise<void> => {
  await import('@modules/index.js');
  for (const registration of getRouteRegistrations()) {
    await app.register(registration.plugin, { prefix: registration.prefix });
  }
};
