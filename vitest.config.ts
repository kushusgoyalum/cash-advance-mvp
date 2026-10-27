import path from 'node:path';
import { defineConfig } from 'vitest/config';

const r = (p: string): string => path.resolve(import.meta.dirname, p);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@modules\/(.*)$/, replacement: r('src/modules/$1') },
      { find: /^@database\/(.*)$/, replacement: r('src/modules/database/$1') },
      { find: /^@common\/(.*)$/, replacement: r('src/modules/shared/$1') },
      { find: /^@routes\/(.*)$/, replacement: r('src/routes/$1') },
      { find: '@prisma/mysql-client', replacement: r('node_modules/.prisma/mysql-client') },
      { find: '@prisma/mongodb-client', replacement: r('node_modules/.prisma/mongodb-client') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/test/setupEnv.ts'],
  },
});
