import { defineConfig } from 'vitest/config';

// Config dedicada de la suite de invariantes del nucleo financiero. NO carga el guardNotProd
// (esta suite corre deliberadamente contra el esquema real via INVARIANT_DATABASE_URL, todo en
// BEGIN/ROLLBACK con datos sinteticos). Si INVARIANT_DATABASE_URL no esta seteada, la suite se
// salta sola (describe.skip).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/invariants/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
