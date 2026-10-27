import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { errorHandler, logger } from '@common/index.js';
import { registerApiRoutes } from '@routes/index.js';

/** Builds the HTTP app (API process). Workers do not start an HTTP server. */
export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger, genReqId: () => randomUUID(), trustProxy: true, bodyLimit: 1_048_576 });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Keep the raw body: webhook HMAC must be verified on the exact bytes received.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    request.rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // bigint-safe JSON (amounts in paise / ids are bigint internally).
  app.setReplySerializer((payload) => JSON.stringify(payload, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)));
  app.setErrorHandler(errorHandler);

  await registerApiRoutes(app);
  return app;
};
