import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['test/setup-env.ts'],
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['test/**/*.e2e-spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
