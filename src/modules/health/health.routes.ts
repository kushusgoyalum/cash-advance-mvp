import type { FastifyReply, FastifyRequest } from 'fastify';
import { getBreaker, sendSuccess } from '@common/index.js';
import { getMySQLRootClient, getRedisClient } from '@database/index.js';
import { BANK_BREAKER } from '@modules/thirdParty/index.js';
import { Autowired, type RouteController } from '@routes/autowired.js';
import { ApiModule, ApiPrefix } from '@routes/routes.enum.js';

const live = {
  route: { method: 'GET', path: '/live' },
  handler: async (_req: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, { status: 'ok' }),
} satisfies RouteController;

/** Readiness: DB + Redis reachable. Bank breaker state is reported, never fails readiness. */
const ready = {
  route: { method: 'GET', path: '/ready' },
  handler: async (_req: FastifyRequest, reply: FastifyReply) => {
    const [mysql, redis] = await Promise.all([
      getMySQLRootClient().$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      getRedisClient().ping().then(() => 'up').catch(() => 'down'),
    ]);
    const ok = mysql === 'up';
    return reply.status(ok ? 200 : 503).send({ success: ok, data: { mysql, redis, bankCircuit: getBreaker(BANK_BREAKER).getState() } });
  },
} satisfies RouteController;

export const healthRoutes = Autowired({ module: ApiModule.HEALTH, prefix: ApiPrefix.HEALTH })([live, ready]);
