import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/guardNotProd.ts', './tests/setup/env.ts'],
    include: ['tests/**/*.test.ts'],
    // La suite de invariantes corre con su propia config (vitest.invariants.config.ts) contra
    // el esquema real via INVARIANT_DATABASE_URL. Fuera del run normal, que pasa por el guard.
    exclude: ['node_modules/**', 'tests/invariants/**'],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
