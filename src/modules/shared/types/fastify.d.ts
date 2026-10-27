import 'fastify';
import type { OpsPrincipal, UserPrincipal } from '../middleware/principals.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserPrincipal;
    ops?: OpsPrincipal;
    rawBody?: string;
  }
}
