import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 60_000,
    // Many tests drive real Chromium. Too many at once starve each other and time out.
    maxWorkers: 3,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { lines: 80 },
    },
  },
});
