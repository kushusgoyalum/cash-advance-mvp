/**
 * Boots the real Fastify app in-process (no DB calls needed for these checks) and verifies
 * route registration + auth/signature guards. Usage: `pnpm smoke` (needs a .env or env vars).
 */
import { buildApp } from '../src/app.js';

const app = await buildApp();
await app.ready();
console.log(app.printRoutes({ commonPrefix: false }));

const checks: Array<[string, Promise<{ statusCode: number }>, number]> = [
  ['GET /health/live', app.inject({ method: 'GET', url: '/health/live' }), 200],
  ['GET eligibility without JWT', app.inject({ method: 'GET', url: '/v1/cash-advance/eligibility' }), 401],
  ['GET admin search without ops token', app.inject({ method: 'GET', url: '/admin/v1/cash-advance/applications' }), 401],
  ['POST internal job without service token', app.inject({ method: 'POST', url: '/internal/v1/cash-advance/jobs/collection-plan/run', payload: {} }), 403],
  [
    'POST bank webhook with bad signature',
    app.inject({
      method: 'POST',
      url: '/webhooks/v1/banking',
      headers: { 'x-signature': 'f'.repeat(64), 'x-timestamp': String(Math.floor(Date.now() / 1000)) },
      payload: { eventId: 'e1', eventType: 'PAYOUT_STATUS', data: {} },
    }),
    401,
  ],
];

let failed = 0;
for (const [name, res, expected] of checks) {
  const { statusCode } = await res;
  const ok = statusCode === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} → ${statusCode} (expected ${expected})`);
}
await app.close();
process.exit(failed ? 1 : 0);
