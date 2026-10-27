import type { FastifyPluginCallback, FastifySchema, preHandlerAsyncHookHandler } from 'fastify';
import type { ApiModule } from './routes.enum.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Zod request schemas + OpenAPI metadata (tags/summary). */
export type RouteSchema = FastifySchema & { tags?: readonly string[]; summary?: string };

/** A controller is a plain route object: method/path + Zod schema + handler (+ optional guards). */
export interface AnnotatedRoute {
  route: { method: HttpMethod; path: string };
  schema?: RouteSchema;
  preHandler?: preHandlerAsyncHookHandler | preHandlerAsyncHookHandler[];
  handler: unknown;
}

export type RouteController = AnnotatedRoute;

export interface RouteRegistration {
  module: ApiModule;
  prefix: string;
  plugin: FastifyPluginCallback;
}

interface AutowiredInput {
  module: ApiModule;
  prefix: string;
  /** Applied to every route in the module (e.g. userJwtAuth / opsAuth / internalAuth). */
  preHandler?: preHandlerAsyncHookHandler | preHandlerAsyncHookHandler[];
}

const routeRegistry = new Map<ApiModule, RouteRegistration>();

const toArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Turns an array of annotated routes into a Fastify plugin AND self-registers it in the
 * central registry at import time; `registerApiRoutes` then mounts every module.
 */
export const Autowired =
  ({ module, prefix, preHandler }: AutowiredInput) =>
  (routes: readonly AnnotatedRoute[]): FastifyPluginCallback => {
    const plugin: FastifyPluginCallback = (app, _opts, done) => {
      for (const r of routes) {
        app.route({
          method: r.route.method,
          url: r.route.path,
          ...(r.schema ? { schema: r.schema as FastifySchema } : {}),
          preHandler: [...toArray(preHandler), ...toArray(r.preHandler)],
          handler: r.handler as never,
        });
      }
      done();
    };
    routeRegistry.set(module, { module, prefix, plugin });
    return plugin;
  };

export const getRouteRegistrations = (): RouteRegistration[] => [...routeRegistry.values()];
